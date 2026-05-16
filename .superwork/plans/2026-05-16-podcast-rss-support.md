# Podcast RSS Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持播客 RSS 源的音视频附件解析、入库和文章详情播放，并让播客源跳过全文、摘要、翻译和文章过滤流程。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — shared workflow rules and project-wide checklists
- `.superwork/spec/guides/repo-map.md` — RSS integration, worker, API, and frontend locations
- `.superwork/spec/guides/change-boundaries.md` — route, service, repository, worker, and shared-layer boundaries
- `.superwork/spec/guides/verification.md` — backend, frontend, database, and cross-layer verification requirements
- `.superwork/spec/backend/index.md` — backend scope and verification checklist
- `.superwork/spec/backend/structure.md` — RSS integration, repository, and worker placement rules
- `.superwork/spec/backend/contracts.md` — route-to-service and service-to-repository contracts
- `.superwork/spec/frontend/index.md` — frontend scope and test expectations
- `.superwork/spec/frontend/contracts.md` — ArticleView and API client interaction contracts
- `.superwork/spec/shared/index.md` — shared type and API-client verification checklist
- `.superwork/spec/shared/structure.md` — shared-layer placement constraints
- `.superwork/prd/2026-05-16-podcast-rss-support-design.md` — approved podcast RSS design and scope

**Architecture:** Extend RSS parsing to produce playable `mediaAttachments`, persist them in a dedicated `article_media_attachments` table, expose them through article detail DTOs, and render the first playable attachment in `ArticleView`. Feed refresh classifies a refresh as podcast when any parsed item contains playable media and skips text-centric automation for every inserted article from that refresh.

**Tech Stack:** Next.js, React, TypeScript, `rss-parser`, PostgreSQL migrations, `pg`, `pg-boss`, Vitest, Testing Library, `pnpm`.

---

### Task 1: Parse Podcast Enclosures

**Files:**

- Modify: `src/server/integrations/rss/parseFeed.ts`
- Modify: `src/test/server/rss/parseFeed.test.ts`
- Create: `src/server/integrations/rss/__fixtures__/podcast-rss.xml`
- Create: `src/server/integrations/rss/__fixtures__/podcast-atom.xml`

- [ ] **Step 1: Add failing RSS and Atom parser tests**

Append these tests inside `describe('rss parsing', () => { ... })` in `src/test/server/rss/parseFeed.test.ts`:

```ts
  it('parses playable RSS podcast enclosures with duration', async () => {
    const xml = await readFixture('podcast-rss.xml');
    const feed = await parseFeed(xml, new Date('2026-05-16T00:00:00Z'));

    expect(feed.items[0].mediaAttachments).toEqual([
      {
        url: 'https://pod.example.com/episodes/1.mp3',
        mimeType: 'audio/mpeg',
        sizeBytes: 12345678,
        durationSeconds: 3723,
      },
    ]);
    expect(feed.items[0].previewImage).toBe('https://pod.example.com/cover.jpg');
    expect(feed.items[1].mediaAttachments).toEqual([]);
  });

  it('parses playable Atom enclosure links', async () => {
    const xml = await readFixture('podcast-atom.xml');
    const feed = await parseFeed(xml, new Date('2026-05-16T00:00:00Z'));

    expect(feed.items[0].mediaAttachments).toEqual([
      {
        url: 'https://pod.example.com/episodes/atom-video.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 222,
        durationSeconds: null,
      },
    ]);
  });
```

- [ ] **Step 2: Add podcast fixtures**

Create `src/server/integrations/rss/__fixtures__/podcast-rss.xml`:

```xml
<?xml version="1.0"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Example Podcast</title>
    <link>https://pod.example.com</link>
    <language>en</language>
    <item>
      <guid>episode-1</guid>
      <title>Episode 1</title>
      <link>https://pod.example.com/episodes/1</link>
      <pubDate>Sat, 16 May 2026 00:00:00 GMT</pubDate>
      <description>Episode summary</description>
      <itunes:duration>1:02:03</itunes:duration>
      <itunes:image href="https://pod.example.com/cover.jpg" />
      <enclosure url="/episodes/1.mp3" length="12345678" type="audio/mpeg" />
    </item>
    <item>
      <guid>episode-2</guid>
      <title>Episode 2</title>
      <enclosure url="javascript:alert(1)" length="-1" type="audio/mpeg" />
      <enclosure url="https://pod.example.com/cover.png" length="10" type="image/png" />
    </item>
  </channel>
</rss>
```

Create `src/server/integrations/rss/__fixtures__/podcast-atom.xml`:

```xml
<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Atom Podcast</title>
  <link href="https://pod.example.com/" />
  <entry>
    <id>atom-episode-1</id>
    <title>Atom Episode 1</title>
    <updated>2026-05-16T00:00:00Z</updated>
    <link href="https://pod.example.com/episodes/atom-1" />
    <link rel="enclosure" href="/episodes/atom-video.mp4" type="video/mp4" length="222" />
  </entry>
</feed>
```

- [ ] **Step 3: Run parser tests and verify failure**

Run: `pnpm test:unit -- --run src/test/server/rss/parseFeed.test.ts`

Expected: FAIL because `ParsedFeedItem` has no `mediaAttachments`.

- [ ] **Step 4: Implement media attachment parsing**

Update `src/server/integrations/rss/parseFeed.ts`:

```ts
export interface ParsedFeedMediaAttachment {
  url: string;
  mimeType: string;
  sizeBytes: number | null;
  durationSeconds: number | null;
}

export interface ParsedFeedItem {
  title: string;
  link: string | null;
  guid: string | null;
  author: string | null;
  publishedAt: Date;
  contentHtml: string | null;
  previewImage: string | null;
  summary: string | null;
  mediaAttachments: ParsedFeedMediaAttachment[];
}
```

Add `itunes:duration` to `customFields.item`:

```ts
      ['itunes:duration', 'itunesDuration'],
```

Add helpers near URL helpers:

```ts
function normalizeMimeType(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized.startsWith('audio/') && !normalized.startsWith('video/')) return null;
  return normalized;
}

function parseNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function parseItunesDuration(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    return parseNonNegativeInteger(trimmed);
  }

  const parts = trimmed.split(':').map((part) => part.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }

  const numbers = parts.map(Number);
  const [hours, minutes, seconds] =
    numbers.length === 3 ? numbers : [0, numbers[0], numbers[1]];
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}
```

Add attachment extraction:

```ts
function extractMediaAttachments(
  item: unknown,
  input: { baseUrl: string | null; durationSeconds: number | null },
): ParsedFeedMediaAttachment[] {
  if (typeof item !== 'object' || item === null) return [];

  const attachments: ParsedFeedMediaAttachment[] = [];
  const seen = new Set<string>();

  const pushAttachment = (candidate: {
    url: unknown;
    mimeType: unknown;
    sizeBytes?: unknown;
  }) => {
    const url = normalizeHttpUrl(candidate.url, input.baseUrl);
    const mimeType = normalizeMimeType(candidate.mimeType);
    if (!url || !mimeType || seen.has(url)) return;
    seen.add(url);
    attachments.push({
      url,
      mimeType,
      sizeBytes: parseNonNegativeInteger(candidate.sizeBytes),
      durationSeconds: input.durationSeconds,
    });
  };

  const enclosure = (item as { enclosure?: unknown }).enclosure;
  for (const node of Array.isArray(enclosure) ? enclosure : [enclosure]) {
    if (typeof node !== 'object' || node === null) continue;
    const record = node as { url?: unknown; type?: unknown; length?: unknown };
    pushAttachment({
      url: record.url,
      mimeType: record.type,
      sizeBytes: record.length,
    });
  }

  const links = (item as { links?: unknown }).links;
  for (const link of Array.isArray(links) ? links : []) {
    const rel = (getXmlAttr(link, 'rel') ?? '').toLowerCase();
    if (rel !== 'enclosure') continue;
    pushAttachment({
      url: getXmlAttr(link, 'href'),
      mimeType: getXmlAttr(link, 'type'),
      sizeBytes: getXmlAttr(link, 'length'),
    });
  }

  return attachments;
}
```

Inside item mapping, compute duration and return attachments:

```ts
    const durationSeconds = parseItunesDuration(
      getStringField(item, 'itunesDuration') ?? getStringField(item, 'itunes:duration'),
    );
    const mediaAttachments = extractMediaAttachments(item, { baseUrl, durationSeconds });

    return {
      title: typeof item.title === 'string' ? item.title : '',
      link: typeof item.link === 'string' ? item.link : null,
      guid: typeof item.guid === 'string' ? item.guid : null,
      author,
      publishedAt,
      contentHtml,
      previewImage,
      summary,
      mediaAttachments,
    };
```

- [ ] **Step 5: Run parser tests and verify pass**

Run: `pnpm test:unit -- --run src/test/server/rss/parseFeed.test.ts`

Expected: PASS.

### Task 2: Add Media Attachment Persistence

**Files:**

- Create: `src/server/infra/db/migrations/0026_article_media_attachments.sql`
- Create: `src/test/server/db/migrations/articleMediaAttachmentsMigration.test.ts`
- Modify: `src/server/domains/articles/repositories/articlesRepo.ts`
- Create: `src/test/server/repositories/articlesRepo.mediaAttachments.test.ts`

- [ ] **Step 1: Add failing migration test**

Create `src/test/server/db/migrations/articleMediaAttachmentsMigration.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('article media attachments migration', () => {
  it('creates article media attachments table', () => {
    const migrationPath = 'src/server/infra/db/migrations/0026_article_media_attachments.sql';
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('create table if not exists article_media_attachments');
    expect(sql).toContain('article_id bigint not null references articles(id) on delete cascade');
    expect(sql).toContain('mime_type text not null');
    expect(sql).toContain('article_media_attachments_article_id_idx');
    expect(sql).toContain('article_media_attachments_article_url_unique');
  });
});
```

- [ ] **Step 2: Run migration test and verify failure**

Run: `pnpm test:unit -- --run src/test/server/db/migrations/articleMediaAttachmentsMigration.test.ts`

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Add migration**

Create `src/server/infra/db/migrations/0026_article_media_attachments.sql`:

```sql
create table if not exists article_media_attachments (
  id bigint generated by default as identity primary key,
  article_id bigint not null references articles(id) on delete cascade,
  url text not null,
  mime_type text not null,
  size_bytes bigint null,
  duration_seconds int null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists article_media_attachments_article_id_idx
  on article_media_attachments (article_id);

create unique index if not exists article_media_attachments_article_url_unique
  on article_media_attachments (article_id, url);
```

- [ ] **Step 4: Run migration test and verify pass**

Run: `pnpm test:unit -- --run src/test/server/db/migrations/articleMediaAttachmentsMigration.test.ts`

Expected: PASS.

- [ ] **Step 5: Add failing repository tests**

Create `src/test/server/repositories/articlesRepo.mediaAttachments.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('articlesRepo (media attachments)', () => {
  it('inserts article media attachments in stable order', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/articles/repositories/articlesRepo');

    await mod.insertArticleMediaAttachments(pool, 'article-1', [
      {
        url: 'https://pod.example.com/1.mp3',
        mimeType: 'audio/mpeg',
        sizeBytes: 123,
        durationSeconds: 456,
      },
      {
        url: 'https://pod.example.com/1.mp4',
        mimeType: 'video/mp4',
        sizeBytes: null,
        durationSeconds: null,
      },
    ]);

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('insert into article_media_attachments');
    expect(sql).toContain('on conflict (article_id, url) do nothing');
    expect(query.mock.calls[0]?.[1]).toEqual([
      'article-1',
      'https://pod.example.com/1.mp3',
      'audio/mpeg',
      123,
      456,
      0,
      'https://pod.example.com/1.mp4',
      'video/mp4',
      null,
      null,
      1,
    ]);
  });

  it('lists media attachments by article id', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'att-1',
          articleId: 'article-1',
          url: 'https://pod.example.com/1.mp3',
          mimeType: 'audio/mpeg',
          sizeBytes: '123',
          durationSeconds: 456,
        },
      ],
    });
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/articles/repositories/articlesRepo');

    const rows = await mod.listArticleMediaAttachments(pool, 'article-1');

    expect(rows).toEqual([
      {
        id: 'att-1',
        articleId: 'article-1',
        url: 'https://pod.example.com/1.mp3',
        mimeType: 'audio/mpeg',
        sizeBytes: '123',
        durationSeconds: 456,
      },
    ]);
    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('order by position asc, id asc');
    expect(query.mock.calls[0]?.[1]).toEqual(['article-1']);
  });
});
```

- [ ] **Step 6: Run repository tests and verify failure**

Run: `pnpm test:unit -- --run src/test/server/repositories/articlesRepo.mediaAttachments.test.ts`

Expected: FAIL because repository functions do not exist.

- [ ] **Step 7: Implement repository functions**

Add these types after `ArticleSearchResult` in `src/server/domains/articles/repositories/articlesRepo.ts`:

```ts
export interface ArticleMediaAttachmentRow {
  id: string;
  articleId: string;
  url: string;
  mimeType: string;
  sizeBytes: string | null;
  durationSeconds: number | null;
}

export interface ArticleMediaAttachmentInput {
  url: string;
  mimeType: string;
  sizeBytes: number | null;
  durationSeconds: number | null;
}
```

Add functions after `getArticleById`:

```ts
export async function insertArticleMediaAttachments(
  pool: DbClient,
  articleId: string,
  attachments: ArticleMediaAttachmentInput[],
): Promise<void> {
  if (attachments.length === 0) return;

  const values: Array<string | number | null> = [];
  const tuples = attachments.map((attachment, index) => {
    const offset = index * 5;
    values.push(
      articleId,
      attachment.url,
      attachment.mimeType,
      attachment.sizeBytes,
      attachment.durationSeconds,
      index,
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
  });

  await pool.query(
    `
      insert into article_media_attachments(
        article_id,
        url,
        mime_type,
        size_bytes,
        duration_seconds,
        position
      )
      values ${tuples.join(', ')}
      on conflict (article_id, url) do nothing
    `,
    values,
  );
}

export async function listArticleMediaAttachments(
  pool: DbClient,
  articleId: string,
): Promise<ArticleMediaAttachmentRow[]> {
  const { rows } = await pool.query<ArticleMediaAttachmentRow>(
    `
      select
        id,
        article_id as "articleId",
        url,
        mime_type as "mimeType",
        size_bytes as "sizeBytes",
        duration_seconds as "durationSeconds"
      from article_media_attachments
      where article_id = $1
      order by position asc, id asc
    `,
    [articleId],
  );
  return rows;
}
```

- [ ] **Step 8: Run repository tests and verify pass**

Run: `pnpm test:unit -- --run src/test/server/repositories/articlesRepo.mediaAttachments.test.ts`

Expected: PASS.

### Task 3: Ingest Podcast Attachments and Skip Text Automation

**Files:**

- Modify: `src/worker/index.ts`
- Create: `src/test/worker/podcastFeedIngestion.test.ts`

- [ ] **Step 1: Add failing worker ingestion tests**

Create `src/test/worker/podcastFeedIngestion.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

describe('podcast feed ingestion', () => {
  it('stores media attachments and skips article filtering for podcast feeds', async () => {
    const boss = { send: vi.fn().mockResolvedValue('job-1') };
    const createdRows = [{ id: 'article-1' }];
    const deps = {
      getPool: () => ({ query: vi.fn() }),
      getFeedForFetch: vi.fn().mockResolvedValue({
        id: 'feed-1',
        url: 'https://pod.example.com/rss.xml',
        enabled: true,
        etag: null,
        lastModified: null,
        lastFetchedAt: null,
        fetchIntervalMinutes: 30,
        fullTextOnFetchEnabled: true,
        aiSummaryOnFetchEnabled: true,
        bodyTranslateOnFetchEnabled: true,
        titleTranslateEnabled: true,
      }),
      isSafeExternalUrl: vi.fn().mockResolvedValue(true),
      getAppSettings: vi.fn().mockResolvedValue({
        rssTimeoutMs: 10000,
        rssUserAgent: 'FeedFuse/1.0',
      }),
      getUiSettings: vi.fn().mockResolvedValue({}),
      fetchFeedXml: vi.fn().mockResolvedValue({
        status: 200,
        etag: null,
        lastModified: null,
        xml: '<rss />',
      }),
      parseFeed: vi.fn().mockResolvedValue({
        title: 'Podcast',
        link: 'https://pod.example.com',
        language: 'en',
        items: [
          {
            title: 'Episode 1',
            link: 'https://pod.example.com/1',
            guid: 'episode-1',
            author: null,
            publishedAt: new Date('2026-05-16T00:00:00Z'),
            contentHtml: '<p>Episode</p>',
            previewImage: null,
            summary: 'Episode summary',
            mediaAttachments: [
              {
                url: 'https://pod.example.com/1.mp3',
                mimeType: 'audio/mpeg',
                sizeBytes: 123,
                durationSeconds: 456,
              },
            ],
          },
        ],
      }),
      sanitizeContent: vi.fn((html: string | null) => html),
      insertArticleIgnoreDuplicate: vi.fn().mockResolvedValue(createdRows[0]),
      insertArticleMediaAttachments: vi.fn().mockResolvedValue(undefined),
      pruneFeedArticlesToLimit: vi.fn().mockResolvedValue({ deletedCount: 0 }),
      recordFeedFetchResult: vi.fn().mockResolvedValue(undefined),
      isFeedDue: vi.fn().mockReturnValue(true),
    };

    const { fetchAndIngestFeed } = await import('../../worker/index');
    const result = await fetchAndIngestFeed(boss as never, 'feed-1', { deps });

    expect(result).toEqual({ inserted: 1, errorMessage: null });
    expect(deps.insertArticleMediaAttachments).toHaveBeenCalledWith(
      expect.anything(),
      'article-1',
      [
        {
          url: 'https://pod.example.com/1.mp3',
          mimeType: 'audio/mpeg',
          sizeBytes: 123,
          durationSeconds: 456,
        },
      ],
    );
    expect(boss.send).not.toHaveBeenCalled();
    expect(deps.insertArticleIgnoreDuplicate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filterStatus: 'passed',
        isFiltered: false,
        filteredBy: [],
        filterEvaluatedAt: expect.any(String),
      }),
    );
  });

  it('keeps normal RSS feeds on the article filter queue', async () => {
    const boss = { send: vi.fn().mockResolvedValue('job-1') };
    const deps = {
      getPool: () => ({ query: vi.fn() }),
      getFeedForFetch: vi.fn().mockResolvedValue({
        id: 'feed-1',
        url: 'https://example.com/rss.xml',
        enabled: true,
        etag: null,
        lastModified: null,
        lastFetchedAt: null,
        fetchIntervalMinutes: 30,
        fullTextOnFetchEnabled: true,
        aiSummaryOnFetchEnabled: true,
        bodyTranslateOnFetchEnabled: true,
        titleTranslateEnabled: true,
      }),
      isSafeExternalUrl: vi.fn().mockResolvedValue(true),
      getAppSettings: vi.fn().mockResolvedValue({
        rssTimeoutMs: 10000,
        rssUserAgent: 'FeedFuse/1.0',
      }),
      getUiSettings: vi.fn().mockResolvedValue({}),
      fetchFeedXml: vi.fn().mockResolvedValue({
        status: 200,
        etag: null,
        lastModified: null,
        xml: '<rss />',
      }),
      parseFeed: vi.fn().mockResolvedValue({
        title: 'RSS',
        link: 'https://example.com',
        language: 'en',
        items: [
          {
            title: 'Article 1',
            link: 'https://example.com/1',
            guid: 'article-1',
            author: null,
            publishedAt: new Date('2026-05-16T00:00:00Z'),
            contentHtml: '<p>Article</p>',
            previewImage: null,
            summary: 'Article summary',
            mediaAttachments: [],
          },
        ],
      }),
      sanitizeContent: vi.fn((html: string | null) => html),
      insertArticleIgnoreDuplicate: vi.fn().mockResolvedValue({ id: 'article-1' }),
      insertArticleMediaAttachments: vi.fn().mockResolvedValue(undefined),
      pruneFeedArticlesToLimit: vi.fn().mockResolvedValue({ deletedCount: 0 }),
      recordFeedFetchResult: vi.fn().mockResolvedValue(undefined),
      isFeedDue: vi.fn().mockReturnValue(true),
    };

    const { fetchAndIngestFeed } = await import('../../worker/index');
    const result = await fetchAndIngestFeed(boss as never, 'feed-1', { deps });

    expect(result).toEqual({ inserted: 1, errorMessage: null });
    expect(deps.insertArticleMediaAttachments).not.toHaveBeenCalled();
    expect(boss.send).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run worker tests and verify failure**

Run: `pnpm test:unit -- --run src/test/worker/podcastFeedIngestion.test.ts`

Expected: FAIL because `fetchAndIngestFeed` is not exported and `worker/index.ts` auto-starts `main()`.

- [ ] **Step 3: Refactor worker entrypoint and add dependencies**

Modify imports in `src/worker/index.ts` to include attachment repository:

```ts
import {
  getArticleById,
  insertArticleIgnoreDuplicate,
  insertArticleMediaAttachments,
  pruneFeedArticlesToLimit,
  recordArticleTitleTranslationFailure,
  setArticleTitleTranslation,
} from '@/server/domains/articles/repositories/articlesRepo';
```

Add a dependency type near `FeedFetchResult`:

```ts
type FeedIngestionDeps = {
  getPool: typeof getPool;
  getFeedForFetch: typeof getFeedForFetch;
  isSafeExternalUrl: typeof isSafeExternalUrl;
  getAppSettings: typeof getAppSettings;
  getUiSettings: typeof getUiSettings;
  fetchFeedXml: typeof fetchFeedXml;
  parseFeed: typeof parseFeed;
  sanitizeContent: typeof sanitizeContent;
  insertArticleIgnoreDuplicate: typeof insertArticleIgnoreDuplicate;
  insertArticleMediaAttachments: typeof insertArticleMediaAttachments;
  pruneFeedArticlesToLimit: typeof pruneFeedArticlesToLimit;
  recordFeedFetchResult: typeof recordFeedFetchResult;
  isFeedDue: typeof isFeedDue;
};

const defaultFeedIngestionDeps: FeedIngestionDeps = {
  getPool,
  getFeedForFetch,
  isSafeExternalUrl,
  getAppSettings,
  getUiSettings,
  fetchFeedXml,
  parseFeed,
  sanitizeContent,
  insertArticleIgnoreDuplicate,
  insertArticleMediaAttachments,
  pruneFeedArticlesToLimit,
  recordFeedFetchResult,
  isFeedDue,
};
```

Change the function signature:

```ts
export async function fetchAndIngestFeed(
  boss: PgBoss,
  feedId: string,
  input?: { force?: boolean; deps?: Partial<FeedIngestionDeps> },
): Promise<FeedFetchResult> {
  const deps = { ...defaultFeedIngestionDeps, ...(input?.deps ?? {}) };
  const pool = deps.getPool();
  const feed = await deps.getFeedForFetch(pool, feedId);
```

Replace direct calls inside `fetchAndIngestFeed` with `deps.*`, including `deps.recordFeedFetchResult`, `deps.isSafeExternalUrl`, `deps.getAppSettings`, `deps.getUiSettings`, `deps.fetchFeedXml`, `deps.parseFeed`, `deps.sanitizeContent`, `deps.insertArticleIgnoreDuplicate`, and `deps.pruneFeedArticlesToLimit`.

Add podcast classification after parsing:

```ts
    const parsed = await deps.parseFeed(res.xml, fetchedAt);
    const isPodcastSource = parsed.items.some((item) => item.mediaAttachments.length > 0);
```

When inserting articles, choose filter fields:

```ts
      const created = await deps.insertArticleIgnoreDuplicate(pool, {
        feedId,
        dedupeKey: buildDedupeKey(item),
        title: item.title || '(untitled)',
        link: item.link,
        author: item.author,
        publishedAt: item.publishedAt.toISOString(),
        contentHtml: deps.sanitizeContent(item.contentHtml, { baseUrl }),
        previewImageUrl: item.previewImage,
        summary: item.summary,
        sourceLanguage: parsed.language,
        filterStatus: isPodcastSource ? 'passed' : 'pending',
        isFiltered: false,
        filteredBy: [],
        filterEvaluatedAt: isPodcastSource ? new Date().toISOString() : null,
        filterErrorMessage: null,
      });
```

After `inserted += 1`, persist attachments:

```ts
      await deps.insertArticleMediaAttachments(pool, created.id, item.mediaAttachments);

      if (isPodcastSource) {
        continue;
      }
```

Replace prune call:

```ts
      await deps.pruneFeedArticlesToLimit(pool, feedId, uiSettings.rss.maxStoredArticlesPerFeed);
```

Guard startup at the bottom:

```ts
const isDirectRun = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run worker tests and verify pass**

Run: `pnpm test:unit -- --run src/test/worker/podcastFeedIngestion.test.ts`

Expected: PASS.

### Task 4: Expose Attachments Through Article API and Client Types

**Files:**

- Modify: `src/app/api/articles/[id]/route.ts`
- Modify: `src/lib/api/apiClient.ts`
- Modify: `src/types/index.ts`
- Modify: `src/test/app/api/articles/routes.test.ts`
- Modify: `src/test/store/appStore.test.ts`

- [ ] **Step 1: Add failing API route test**

In `src/test/app/api/articles/routes.test.ts`, update the repository mock to export `listArticleMediaAttachments`:

```ts
const listArticleMediaAttachmentsMock = vi.fn();

vi.mock('@/server/domains/articles/repositories/articlesRepo', () => ({
  getArticleById: (...args: unknown[]) => getArticleByIdMock(...args),
  listArticleMediaAttachments: (...args: unknown[]) => listArticleMediaAttachmentsMock(...args),
  setArticleRead: (...args: unknown[]) => setArticleReadMock(...args),
  setArticleStarred: (...args: unknown[]) => setArticleStarredMock(...args),
  markAllRead: (...args: unknown[]) => markAllReadMock(...args),
}));
```

In the existing `beforeEach`, add:

```ts
    listArticleMediaAttachmentsMock.mockReset();
    listArticleMediaAttachmentsMock.mockResolvedValue([]);
```

Add this test near `GET returns article`:

```ts
  it('GET returns article media attachments', async () => {
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Podcast episode',
      titleOriginal: 'Podcast episode',
      titleZh: null,
      link: 'https://pod.example.com/1',
      author: null,
      publishedAt: null,
      contentHtml: '<p>Episode</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      previewImageUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      sourceLanguage: 'en',
      filterStatus: 'passed',
      isFiltered: false,
      filteredBy: [],
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    listArticleMediaAttachmentsMock.mockResolvedValue([
      {
        id: 'attachment-1',
        articleId,
        url: 'https://pod.example.com/1.mp3',
        mimeType: 'audio/mpeg',
        sizeBytes: '123',
        durationSeconds: 456,
      },
    ]);

    const mod = await import('../../../../app/api/articles/[id]/route');
    const res = await mod.GET(new Request(`http://localhost/api/articles/${articleId}`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.mediaAttachments).toEqual([
      {
        id: 'attachment-1',
        url: 'https://pod.example.com/1.mp3',
        mimeType: 'audio/mpeg',
        sizeBytes: 123,
        durationSeconds: 456,
      },
    ]);
  });
```

- [ ] **Step 2: Run API test and verify failure**

Run: `pnpm test:unit -- --run src/test/app/api/articles/routes.test.ts -t "GET returns article media attachments"`

Expected: FAIL because the route does not return `mediaAttachments`.

- [ ] **Step 3: Update route and DTO mapping**

In `src/app/api/articles/[id]/route.ts`, import `listArticleMediaAttachments`:

```ts
import {
  getArticleById,
  listArticleMediaAttachments,
  setArticleRead,
  setArticleStarred,
  type ArticleRow,
} from '@/server/domains/articles/repositories/articlesRepo';
```

Add mapper:

```ts
function mapMediaAttachment(row: Awaited<ReturnType<typeof listArticleMediaAttachments>>[number]) {
  return {
    id: row.id,
    url: row.url,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
    durationSeconds: row.durationSeconds,
  };
}
```

Inside `GET`, load attachments:

```ts
    const [aiSummarySession, aiDigestSources, mediaAttachments] = await Promise.all([
      getActiveAiSummarySessionByArticleId(pool, article.id),
      listAiDigestRunSourcesByArticleId(pool, article.id),
      listArticleMediaAttachments(pool, article.id),
    ]);
```

Return mapped attachments:

```ts
      mediaAttachments: mediaAttachments.map(mapMediaAttachment),
```

- [ ] **Step 4: Update shared and client types**

In `src/types/index.ts`, add:

```ts
export interface ArticleMediaAttachment {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number | null;
  durationSeconds: number | null;
}
```

Add to `Article`:

```ts
  mediaAttachments?: ArticleMediaAttachment[];
```

In `src/lib/api/apiClient.ts`, add:

```ts
export interface ArticleMediaAttachmentDto {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number | null;
  durationSeconds: number | null;
}
```

Add to `ArticleDto`:

```ts
  mediaAttachments?: ArticleMediaAttachmentDto[] | null;
```

Add to `mapArticleDto` return object:

```ts
    mediaAttachments: dto.mediaAttachments?.map((attachment) => ({
      id: attachment.id,
      url: attachment.url,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      durationSeconds: attachment.durationSeconds,
    })) ?? undefined,
```

- [ ] **Step 5: Update store test fixture expectations if needed**

Run: `pnpm test:unit -- --run src/test/store/appStore.test.ts`

Expected: If snapshots or deep equality fail because `mediaAttachments` is now present, add `mediaAttachments: undefined` or `mediaAttachments: []` to the relevant expected article objects. Keep existing behavior unchanged for articles without attachments.

- [ ] **Step 6: Run API route focused test and verify pass**

Run: `pnpm test:unit -- --run src/test/app/api/articles/routes.test.ts -t "GET returns article media attachments"`

Expected: PASS.

### Task 5: Render Podcast Media Player in ArticleView

**Files:**

- Modify: `src/features/articles/components/ArticleView.tsx`
- Create: `src/test/features/articles/ArticleView.mediaAttachments.test.tsx`

- [ ] **Step 1: Add failing ArticleView tests**

Create `src/test/features/articles/ArticleView.mediaAttachments.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleView from '../../../features/articles/components/ArticleView';
import { useAppStore } from '../../../store/appStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { defaultPersistedSettings } from '../../../features/settings/settingsSchema';

type ApiClientModule = typeof import('@/lib/api/apiClient');

const idleTasks = {
  fulltext: { type: 'fulltext' as const, status: 'idle' as const, jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
  ai_summary: { type: 'ai_summary' as const, status: 'idle' as const, jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
  ai_translate: { type: 'ai_translate' as const, status: 'idle' as const, jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
};

vi.mock('@/lib/api/apiClient', async () => {
  const actual = await vi.importActual<ApiClientModule>('@/lib/api/apiClient');
  return {
    ...actual,
    enqueueArticleFulltext: vi.fn(),
    getArticleTasks: vi.fn(),
  };
});

function setupResizeObserverMock() {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('ResizeObserver', MockResizeObserver as unknown as typeof ResizeObserver);
}

async function renderWithAttachment(mimeType: string, url: string) {
  setupResizeObserverMock();
  const apiClient = await import('@/lib/api/apiClient');
  vi.mocked(apiClient.getArticleTasks).mockResolvedValue(idleTasks);

  useSettingsStore.setState((state) => ({
    ...state,
    persistedSettings: {
      ...structuredClone(defaultPersistedSettings),
      general: {
        ...structuredClone(defaultPersistedSettings.general),
        autoMarkReadEnabled: false,
        autoMarkReadDelayMs: 0,
      },
    },
  }));

  useAppStore.setState({
    feeds: [
      {
        id: 'feed-1',
        kind: 'rss',
        title: 'Podcast',
        url: 'https://pod.example.com/rss.xml',
        unreadCount: 0,
        enabled: true,
        fullTextOnOpenEnabled: false,
        fullTextOnFetchEnabled: false,
        aiSummaryOnOpenEnabled: false,
        aiSummaryOnFetchEnabled: false,
        bodyTranslateOnFetchEnabled: false,
        bodyTranslateOnOpenEnabled: false,
        titleTranslateEnabled: false,
        bodyTranslateEnabled: false,
        articleListDisplayMode: 'list',
        fetchStatus: null,
        fetchError: null,
      },
    ],
    articles: [
      {
        id: 'article-1',
        feedId: 'feed-1',
        title: 'Episode 1',
        content: '<p>Episode notes</p>',
        summary: 'summary',
        publishedAt: '2026-05-16T00:00:00.000Z',
        link: 'https://pod.example.com/1',
        isRead: true,
        isStarred: false,
        mediaAttachments: [
          {
            id: 'attachment-1',
            url,
            mimeType,
            sizeBytes: 123,
            durationSeconds: 456,
          },
        ],
      },
    ],
    selectedView: 'all',
    selectedArticleId: 'article-1',
    refreshArticle: vi.fn(),
  });

  render(<ArticleView />);
  await act(async () => {
    await Promise.resolve();
  });
}

describe('ArticleView media attachments', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    useAppStore.setState({ articles: [], feeds: [], selectedArticleId: null });
  });

  it('renders an audio player for audio podcast attachments', async () => {
    await renderWithAttachment('audio/mpeg', 'https://pod.example.com/1.mp3');

    const player = screen.getByTestId('article-media-player');
    expect(player.tagName.toLowerCase()).toBe('audio');
    expect(player).toHaveAttribute('controls');
    expect(player).toHaveAttribute('preload', 'metadata');
    expect(player).toHaveAttribute('src', 'https://pod.example.com/1.mp3');
  });

  it('renders a video player for video podcast attachments', async () => {
    await renderWithAttachment('video/mp4', 'https://pod.example.com/1.mp4');

    const player = screen.getByTestId('article-media-player');
    expect(player.tagName.toLowerCase()).toBe('video');
    expect(player).toHaveAttribute('controls');
    expect(player).toHaveAttribute('preload', 'metadata');
    expect(player).toHaveAttribute('src', 'https://pod.example.com/1.mp4');
  });
});
```

- [ ] **Step 2: Run ArticleView tests and verify failure**

Run: `pnpm test:unit -- --run src/test/features/articles/ArticleView.mediaAttachments.test.tsx`

Expected: FAIL because the media player is not rendered.

- [ ] **Step 3: Implement player rendering**

In `src/features/articles/components/ArticleView.tsx`, add helper functions near constants:

```ts
function getPlayableMediaAttachment(article: { mediaAttachments?: Array<{ url: string; mimeType: string }> } | null) {
  return article?.mediaAttachments?.find((attachment) => {
    const mimeType = attachment.mimeType.toLowerCase();
    return attachment.url && (mimeType.startsWith('audio/') || mimeType.startsWith('video/'));
  }) ?? null;
}
```

Inside `ArticleView`, after `const articleFiltered = ...`, add:

```ts
  const playableMediaAttachment = getPlayableMediaAttachment(article);
```

Render below the title/meta block and before status cards:

```tsx
            {playableMediaAttachment ? (
              <section
                className="mb-5 rounded-lg border border-border/65 bg-card/70 p-3"
                aria-label="播客播放器"
              >
                {playableMediaAttachment.mimeType.toLowerCase().startsWith('audio/') ? (
                  <audio
                    data-testid="article-media-player"
                    className="w-full"
                    src={playableMediaAttachment.url}
                    controls
                    preload="metadata"
                  />
                ) : (
                  <video
                    data-testid="article-media-player"
                    className="max-h-[28rem] w-full rounded-md bg-black"
                    src={playableMediaAttachment.url}
                    controls
                    preload="metadata"
                  />
                )}
              </section>
            ) : null}
```

- [ ] **Step 4: Run ArticleView tests and verify pass**

Run: `pnpm test:unit -- --run src/test/features/articles/ArticleView.mediaAttachments.test.tsx`

Expected: PASS.

### Task 6: Cross-Layer Regression

**Files:**

- Review only unless tests expose gaps.

- [ ] **Step 1: Run targeted backend and frontend tests**

Run:

```bash
pnpm test:unit -- --run \
  src/test/server/rss/parseFeed.test.ts \
  src/test/server/db/migrations/articleMediaAttachmentsMigration.test.ts \
  src/test/server/repositories/articlesRepo.mediaAttachments.test.ts \
  src/test/worker/podcastFeedIngestion.test.ts \
  src/test/app/api/articles/routes.test.ts \
  src/test/features/articles/ArticleView.mediaAttachments.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 3: Run type check**

Run: `pnpm type-check`

Expected: PASS.

- [ ] **Step 4: Run full unit suite if targeted coverage passed**

Run: `pnpm test:unit`

Expected: PASS.

- [ ] **Step 5: Decide spec update**

If implementation preserves the design without creating new long-term rules beyond this PRD, record `superwork-update-spec: no-update` in the final handoff. If the implementation changes API or worker contracts in a durable way not already captured by existing specs, use `superwork-update-spec` and update the relevant backend/frontend contract docs before final completion.
