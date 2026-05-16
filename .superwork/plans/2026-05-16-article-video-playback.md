# Article Video Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持文章正文中的 HTML5 视频在阅读器内直接播放。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — shared workflow rules and project-wide checklists
- `.superwork/spec/guides/repo-map.md` — repository layout and common commands
- `.superwork/spec/guides/verification.md` — required verification depth
- `.superwork/spec/guides/change-boundaries.md` — frontend/backend/shared boundary rules
- `.superwork/spec/backend/index.md` — backend scope and verification checklist
- `.superwork/spec/backend/structure.md` — RSS/fulltext/media integration placement
- `.superwork/spec/backend/contracts.md` — route/service/data contract guidance
- `.superwork/spec/frontend/index.md` — frontend scope and verification checklist
- `.superwork/spec/frontend/structure.md` — article feature placement rules
- `.superwork/spec/frontend/contracts.md` — ArticleView interaction contract
- `.superwork/spec/shared/index.md` — shared utility verification guidance

**Architecture:** Keep video support at the existing article HTML boundary. Backend sanitization preserves safe `video`, `source`, and `track` tags and normalizes URL attributes against the feed/fulltext base URL. Frontend renders the sanitized tags through `ArticleView` and adds responsive styling without adding new player state.

**Tech Stack:** Next.js, React, TypeScript, `sanitize-html`, `@tailwindcss/typography`, Vitest, Testing Library.

---

### Task 1: Sanitize Video HTML

**Files:**

- Modify: `src/server/integrations/rss/sanitizeContent.ts`
- Test: `src/test/server/rss/parseFeed.test.ts`

- [ ] **Step 1: Write the failing sanitization test**

Add this test inside `describe('rss parsing', () => { ... })` in `src/test/server/rss/parseFeed.test.ts`:

```ts
  it('preserves safe article videos and normalizes media sources', () => {
    const cleaned = sanitizeContent(
      [
        '<video src="/media/story.mp4" poster="/media/poster.jpg" width="1280" height="720" autoplay muted loop playsinline preload="metadata" controls controlslist="nodownload" crossorigin="anonymous">',
        '<source src="/media/story.webm" type="video/webm" />',
        '<track src="/media/captions.vtt" kind="captions" srclang="zh" label="中文" default />',
        '</video>',
        '<video src="javascript:alert(1)" poster="javascript:alert(2)" autoplay="false"></video>',
        '<source src="data:text/html;base64,abc" type="video/mp4" />',
        '<track src="ftp://example.com/captions.vtt" kind="captions" />',
      ].join(''),
      { baseUrl: 'https://example.com/articles/1' },
    );

    expect(cleaned).toContain('<video');
    expect(cleaned).toContain('src="https://example.com/media/story.mp4"');
    expect(cleaned).toContain('poster="https://example.com/media/poster.jpg"');
    expect(cleaned).toContain('width="1280"');
    expect(cleaned).toContain('height="720"');
    expect(cleaned).toContain('controls="controls"');
    expect(cleaned).toContain('preload="metadata"');
    expect(cleaned).toContain('playsinline="playsinline"');
    expect(cleaned).toContain('muted="muted"');
    expect(cleaned).toContain('loop="loop"');
    expect(cleaned).toContain('controlslist="nodownload"');
    expect(cleaned).toContain('crossorigin="anonymous"');
    expect(cleaned).toContain('<source src="https://example.com/media/story.webm" type="video/webm" />');
    expect(cleaned).toContain('<track src="https://example.com/media/captions.vtt" kind="captions" srclang="zh" label="中文" default="default" />');
    expect(cleaned).not.toContain('autoplay');
    expect(cleaned).not.toContain('javascript:');
    expect(cleaned).not.toContain('data:text/html');
    expect(cleaned).not.toContain('ftp://');
  });
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm test:unit -- --run src/test/server/rss/parseFeed.test.ts`

Expected: FAIL because `video`, `source`, and `track` are stripped or their attributes are not preserved.

- [ ] **Step 3: Implement video sanitization**

Update `src/server/integrations/rss/sanitizeContent.ts` with these changes:

```ts
import sanitizeHtml from 'sanitize-html';

const allowedTags = [...sanitizeHtml.defaults.allowedTags, 'img', 'video', 'source', 'track'];

const allowedAttributes: sanitizeHtml.IOptions['allowedAttributes'] = {
  ...sanitizeHtml.defaults.allowedAttributes,
  a: ['href', 'name', 'target', 'rel'],
  img: ['src', 'srcset', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
  source: ['src', 'type'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  track: ['src', 'kind', 'srclang', 'label', 'default'],
  video: [
    'src',
    'poster',
    'width',
    'height',
    'controls',
    'preload',
    'playsinline',
    'muted',
    'loop',
    'controlslist',
    'crossorigin',
  ],
};
```

Add helpers near `normalizeNumeric`:

```ts
function normalizeBooleanAttribute(value: string | undefined, attributeName: string): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === attributeName || trimmed === 'true') return attributeName;
  return undefined;
}

function normalizeToken(value: string | undefined, allowed: readonly string[]): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed && allowed.includes(trimmed) ? trimmed : undefined;
}

function normalizeMediaUrlAttribute(
  value: string | undefined,
  base: URL | null,
): string | undefined {
  const url = value?.trim() ? normalizeUrl(value, base) : null;
  return url && isAllowedScheme(url, ['http:', 'https:']) ? url.toString() : undefined;
}
```

Add `allowedSchemesByTag` entries:

```ts
    allowedSchemesByTag: {
      img: ['http', 'https'],
      source: ['http', 'https'],
      track: ['http', 'https'],
      video: ['http', 'https'],
    },
```

Update `exclusiveFilter`:

```ts
    exclusiveFilter: (frame) =>
      (frame.tag === 'img' && !frame.attribs.src) ||
      (frame.tag === 'source' && !frame.attribs.src) ||
      (frame.tag === 'track' && !frame.attribs.src) ||
      (frame.tag === 'video' && !frame.attribs.src && !frame.text?.trim()),
```

Add `source`, `track`, and `video` transforms inside `transformTags`:

```ts
      source: (tagName: string, attribs: sanitizeHtml.Attributes) => {
        const src = normalizeMediaUrlAttribute(attribs.src, base);
        return {
          tagName,
          attribs: {
            ...(src ? { src } : {}),
            ...(attribs.type?.trim() ? { type: attribs.type.trim() } : {}),
          },
        };
      },
      track: (tagName: string, attribs: sanitizeHtml.Attributes) => {
        const src = normalizeMediaUrlAttribute(attribs.src, base);
        const kind = normalizeToken(attribs.kind, [
          'subtitles',
          'captions',
          'descriptions',
          'chapters',
          'metadata',
        ]);
        const srclang = attribs.srclang?.trim();
        const label = attribs.label?.trim();
        const defaultValue = normalizeBooleanAttribute(attribs.default, 'default');

        return {
          tagName,
          attribs: {
            ...(src ? { src } : {}),
            ...(kind ? { kind } : {}),
            ...(srclang ? { srclang } : {}),
            ...(label ? { label } : {}),
            ...(defaultValue ? { default: defaultValue } : {}),
          },
        };
      },
      video: (tagName: string, attribs: sanitizeHtml.Attributes) => {
        const src = normalizeMediaUrlAttribute(attribs.src, base);
        const poster = normalizeMediaUrlAttribute(attribs.poster, base);
        const width = normalizeNumeric(attribs.width);
        const height = normalizeNumeric(attribs.height);
        const preload = normalizeToken(attribs.preload, ['none', 'metadata', 'auto']);
        const playsinline = normalizeBooleanAttribute(attribs.playsinline, 'playsinline');
        const muted = normalizeBooleanAttribute(attribs.muted, 'muted');
        const loop = normalizeBooleanAttribute(attribs.loop, 'loop');
        const controlsList = attribs.controlslist
          ?.split(/\s+/)
          .map((token) => token.trim().toLowerCase())
          .filter((token) => ['nodownload', 'nofullscreen', 'noremoteplayback'].includes(token))
          .join(' ');
        const crossorigin = normalizeToken(attribs.crossorigin, ['anonymous', 'use-credentials']);

        return {
          tagName,
          attribs: {
            ...(src ? { src } : {}),
            ...(poster ? { poster } : {}),
            ...(width ? { width } : {}),
            ...(height ? { height } : {}),
            controls: 'controls',
            ...(preload ? { preload } : {}),
            ...(playsinline ? { playsinline } : {}),
            ...(muted ? { muted } : {}),
            ...(loop ? { loop } : {}),
            ...(controlsList ? { controlslist: controlsList } : {}),
            ...(crossorigin ? { crossorigin } : {}),
          },
        };
      },
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `pnpm test:unit -- --run src/test/server/rss/parseFeed.test.ts`

Expected: PASS.

---

### Task 2: Render Article Videos Responsively

**Files:**

- Modify: `src/features/articles/components/ArticleView.tsx`
- Test: `src/test/features/articles/ArticleView.imagePreview.test.tsx`

- [ ] **Step 1: Write the failing ArticleView test**

Add this test inside `describe('ArticleView image preview', () => { ... })` in `src/test/features/articles/ArticleView.imagePreview.test.tsx`:

```tsx
  it('renders playable article videos without image preview affordances', async () => {
    await renderArticleViewWithContent(
      '<p>Intro</p><video src="https://cdn.example.com/story.mp4" poster="https://cdn.example.com/poster.jpg" controls="controls"><source src="https://cdn.example.com/story.webm" type="video/webm" /></video>',
    );

    const content = screen.getByTestId('article-html-content');
    const video = content.querySelector('video');
    const source = content.querySelector('source');

    expect(video).toBeInstanceOf(HTMLVideoElement);
    expect(video).toHaveAttribute('src', 'https://cdn.example.com/story.mp4');
    expect(video).toHaveAttribute('poster', 'https://cdn.example.com/poster.jpg');
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveClass('rounded-lg');
    expect(video).toHaveClass('bg-black');
    expect(source).toHaveAttribute('src', 'https://cdn.example.com/story.webm');
    expect(source).toHaveAttribute('type', 'video/webm');
    expect(video).not.toHaveClass('cursor-zoom-in');
  });
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm test:unit -- --run src/test/features/articles/ArticleView.imagePreview.test.tsx`

Expected: FAIL because `ArticleView` does not add article video styling classes.

- [ ] **Step 3: Add video styling in ArticleView**

In `src/features/articles/components/ArticleView.tsx`, update the effect that currently prepares images:

```tsx
  useEffect(() => {
    const container = articleContentRef.current;
    if (!container) return;

    for (const node of container.querySelectorAll("img")) {
      if (!(node instanceof HTMLImageElement)) continue;
      if (node.closest("a[href]")) continue;

      const alt = node.alt?.trim();
      const label = alt ? `查看大图：${alt}` : "查看大图";
      node.tabIndex = 0;
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", label);
      node.classList.add("cursor-zoom-in");
    }

    for (const node of container.querySelectorAll("video")) {
      if (!(node instanceof HTMLVideoElement)) continue;

      // 文章正文视频来自已清洗 HTML，这里只补齐阅读器内的响应式呈现样式。
      node.classList.add("my-5", "w-full", "max-w-full", "rounded-lg", "bg-black");
    }
  }, [highlightedBodyHtml]);
```

Also add video prose classes to the article content `className`:

```tsx
                "prose max-w-none prose-headings:text-foreground/94 prose-headings:font-semibold prose-p:text-foreground/84 prose-p:font-[450] prose-li:text-foreground/84 prose-li:font-[450] prose-strong:text-foreground/96 prose-blockquote:border-border/90 prose-blockquote:text-foreground/84 prose-figcaption:text-muted-foreground prose-a:text-foreground/94 prose-a:decoration-primary/45 prose-video:my-5 prose-video:w-full prose-video:max-w-full prose-video:rounded-lg prose-video:bg-black dark:prose-invert",
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `pnpm test:unit -- --run src/test/features/articles/ArticleView.imagePreview.test.tsx`

Expected: PASS.

---

### Task 3: Regression Verification And Spec Decision

**Files:**

- Modify: none

- [ ] **Step 1: Run targeted regression tests**

Run:

```bash
pnpm test:unit -- --run src/test/server/rss/parseFeed.test.ts src/test/features/articles/ArticleView.imagePreview.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run baseline checks**

Run:

```bash
pnpm lint
pnpm type-check
```

Expected: both PASS.

- [ ] **Step 3: Decide spec update**

Use `superwork-update-spec` decision:

```text
no-update
```

Reason: this change does not introduce a new durable module boundary, API resource, database contract, or workflow rule. It extends an existing HTML sanitization and rendering contract in place.

- [ ] **Step 4: Commit**

```bash
git add src/server/integrations/rss/sanitizeContent.ts src/test/server/rss/parseFeed.test.ts src/features/articles/components/ArticleView.tsx src/test/features/articles/ArticleView.imagePreview.test.tsx .superwork/plans/2026-05-16-article-video-playback.md
git commit -m "feat(article): 支持正文视频播放" -m $'- 添加文章视频清洗规则与回归测试\n- 更新文章正文视频响应式渲染样式'
```
