# Media Proxy RSS Network Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `mediaProxyGuard` 完整复用 RSS 网络模式语义，同时继续默认拒绝媒体代理访问 localhost/loopback。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — 共享 workflow 入口和跨层检查清单
- `.superwork/spec/guides/repo-map.md` — 单包 `pnpm` 项目结构、后端目录和常用命令
- `.superwork/spec/guides/verification.md` — 默认验证命令和后端测试范围
- `.superwork/spec/guides/change-boundaries.md` — `src/server` 与共享逻辑边界
- `.superwork/spec/backend/index.md` — 后端层范围、验证清单和更新触发条件
- `.superwork/spec/backend/structure.md` — `src/server/integrations/media/**` 与 `rss/**` 的职责
- `.superwork/spec/backend/quality.md` — 后端实现和测试门槛
- `.superwork/spec/backend/contracts.md` — RSS 网络访问契约和媒体代理契约

**Architecture:** `src/server/integrations/rss/ssrfGuard.ts` 已经集中实现 `RSS_NETWORK_MODE=public|fake-ip|lan|custom`、`RSS_ALLOWED_CIDRS`、DNS 解析和 `.local` 解析后判断。`src/server/integrations/media/mediaProxyGuard.ts` 改为先执行媒体代理独有的本地目标禁用，再调用 `getExternalUrlSafety()` 复用 RSS 网络语义。媒体代理不需要新增独立网络配置。

**Tech Stack:** TypeScript, Next.js route/server runtime, `ipaddr.js`, `node:dns/promises`, Vitest, `pnpm@10.30.3`.

## Global Constraints

- 根目录是单个 `pnpm` 包，入口配置见 `package.json`。
- 包管理器固定为 `pnpm@10`。
- 除纯文档修改外，默认至少执行：`pnpm lint`、`pnpm type-check`、与改动相关的测试。
- `src/server/integrations/rss/ssrfGuard.ts` 是 RSS 外链安全判定的统一入口；`route.ts`、worker 和抓取流程不要各自散落一套网络地址规则。
- 媒体代理必须复用 RSS 网络模式语义；`RSS_NETWORK_MODE=fake-ip` 时允许 `198.18.0.0/15` fake-ip 解析结果，默认 `public` 模式仍拒绝该网段。
- 图片、视频、音频等媒体代理的 SSRF 防护必须统一复用 `src/server/integrations/media/mediaProxyGuard.ts`，不要在具体 route 或抓取函数里重复实现网络地址规则。
- 修改媒体代理签名、网络安全策略或 HTML 媒体改写时，至少覆盖 `src/test/app/api/media/image/route.test.ts`、`src/test/server/media/mediaProxyGuard.test.ts` 和 `src/test/server/media/rewriteHtmlImages.test.ts` 的相关用例。

---

### Task 1: 扩展媒体代理网络模式测试

**Files:**

- Modify: `src/test/server/media/mediaProxyGuard.test.ts`

**Interfaces:**

- Consumes: `isSafeMediaUrl(value: string): Promise<boolean>` from `@/server/integrations/media/mediaProxyGuard`
- Produces: 覆盖 `lan`、`custom`、`.local` 解析和 loopback 默认拒绝的媒体代理测试

- [ ] **Step 1: Write the failing test**

在 `src/test/server/media/mediaProxyGuard.test.ts` 中新增这些用例：

```ts
  it('accepts RFC1918 media targets in lan mode', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'lan');
    lookupMock.mockResolvedValue([{ address: '192.168.1.20', family: 4 }]);

    await expect(isSafeMediaUrl('https://nas.example/image.jpg')).resolves.toBe(true);
    await expect(isSafeMediaUrl('http://10.8.0.2/video.mp4')).resolves.toBe(true);
    await expect(isSafeMediaUrl('http://172.16.5.20/audio.mp3')).resolves.toBe(true);
  });

  it('accepts explicitly allowed media CIDRs in custom mode', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'custom');
    vi.stubEnv('RSS_ALLOWED_CIDRS', '100.64.0.0/10,192.168.0.0/16');
    lookupMock.mockResolvedValue([{ address: '100.64.1.2', family: 4 }]);

    await expect(isSafeMediaUrl('https://media.example/image.jpg')).resolves.toBe(true);
    await expect(isSafeMediaUrl('http://192.168.1.2/audio.mp3')).resolves.toBe(true);
  });

  it('accepts .local media hostnames after lan/custom DNS resolution', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'lan');
    lookupMock.mockResolvedValue([{ address: '192.168.1.10', family: 4 }]);
    await expect(isSafeMediaUrl('http://nas.local/image.jpg')).resolves.toBe(true);

    vi.stubEnv('RSS_NETWORK_MODE', 'custom');
    vi.stubEnv('RSS_ALLOWED_CIDRS', '192.168.0.0/16');
    lookupMock.mockResolvedValue([{ address: '192.168.1.11', family: 4 }]);
    await expect(isSafeMediaUrl('http://media.local/video.mp4')).resolves.toBe(true);
  });

  it('keeps rejecting localhost and loopback even when RSS mode allows private ranges', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'lan');
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    await expect(isSafeMediaUrl('http://localhost/image.jpg')).resolves.toBe(false);
    await expect(isSafeMediaUrl('http://127.0.0.1/image.jpg')).resolves.toBe(false);
    await expect(isSafeMediaUrl('https://loopback.example/image.jpg')).resolves.toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- src/test/server/media/mediaProxyGuard.test.ts`

Expected: FAIL，至少 `lan`、`custom`、`.local` 新用例会因为当前 `mediaProxyGuard` 只允许 public/fake-ip 而失败。

---

### Task 2: 复用 RSS 网络模式实现媒体 guard

**Files:**

- Modify: `src/server/integrations/media/mediaProxyGuard.ts`

**Interfaces:**

- Consumes: `getExternalUrlSafety(value: string): Promise<ExternalUrlSafetyResult>` from `@/server/integrations/rss/ssrfGuard`
- Produces: `isSafeMediaUrl(value: string): Promise<boolean>` 继续作为媒体代理统一 SSRF 判断入口

- [ ] **Step 1: Write minimal implementation**

将 `src/server/integrations/media/mediaProxyGuard.ts` 收敛为：

```ts
import ipaddr from 'ipaddr.js';
import { getExternalUrlSafety } from '@/server/integrations/rss/ssrfGuard';

const DOCKER_HOST_ALIAS = 'host.docker.internal';

function isLocalMediaHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === DOCKER_HOST_ALIAS;
}

function isLoopbackIp(hostname: string): boolean {
  return ipaddr.isValid(hostname) && ipaddr.parse(hostname).range() === 'loopback';
}

export async function isSafeMediaUrl(value: string): Promise<boolean> {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  // 媒体代理必须比 RSS 更保守，始终禁止直接访问本机目标。
  if (!hostname || isLocalMediaHostname(hostname) || isLoopbackIp(hostname)) {
    return false;
  }

  return (await getExternalUrlSafety(value)).safe;
}
```

- [ ] **Step 2: Run targeted test to verify it passes**

Run: `pnpm test:unit -- src/test/server/media/mediaProxyGuard.test.ts`

Expected: PASS。

---

### Task 3: 回归验证

**Files:**

- Test: `src/test/server/media/mediaProxyGuard.test.ts`
- Test: `src/test/server/rss/ssrfGuard.test.ts`
- Test: `src/test/app/api/media/image/route.test.ts`
- Test: `src/test/server/media/rewriteHtmlImages.test.ts`

**Interfaces:**

- Consumes: 更新后的 `isSafeMediaUrl()`
- Produces: 验证媒体代理、RSS guard 和图片代理调用方保持一致

- [ ] **Step 1: Run related tests**

Run: `pnpm test:unit -- src/test/server/media/mediaProxyGuard.test.ts src/test/server/rss/ssrfGuard.test.ts src/test/app/api/media/image/route.test.ts src/test/server/media/rewriteHtmlImages.test.ts`

Expected: PASS。

- [ ] **Step 2: Run static checks**

Run: `pnpm lint`

Expected: PASS。

Run: `pnpm type-check`

Expected: PASS。

- [ ] **Step 3: Commit if requested**

```bash
git add src/server/integrations/media/mediaProxyGuard.ts src/test/server/media/mediaProxyGuard.test.ts .superwork/plans/2026-07-08-media-proxy-rss-network-mode.md
git commit -m "fix(media): 复用RSS网络模式" -m $'- 添加媒体代理 LAN、自定义 CIDR 和 .local 解析测试\n- 更新媒体 guard 复用 RSS 安全判定\n- 保持媒体代理拒绝 localhost 与 loopback'
```

Expected: commit succeeds when the user asks for a commit.

