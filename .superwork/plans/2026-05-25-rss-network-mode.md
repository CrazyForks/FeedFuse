# RSS Network Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 RSS URL 安全校验增加分级网络访问模式，支持 `public`、`fake-ip`、`lan`、`custom`，并同步部署配置与文档。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — shared workflow rules and project-wide checklists
- `.superwork/spec/guides/change-boundaries.md` — 跨层变更顺序与共享边界
- `.superwork/spec/guides/verification.md` — 验证基线与按层追加规则
- `.superwork/spec/backend/index.md` — 后端环境变量、route、worker 改动检查点
- `.superwork/spec/backend/contracts.md` — 环境变量契约变更需要同步代码、示例 env 和文档
- `.superwork/spec/shared/index.md` — 共享 env/helper 与 API 客户端改动检查点

**Architecture:** 在 `src/server/infra/env.ts` 中集中解析 `RSS_NETWORK_MODE` 与 `RSS_ALLOWED_CIDRS`，由 `ssrfGuard` 统一决定哪些 IP 段可访问。保留 `RSS_ALLOW_FAKE_IP` 作为向后兼容入口，但语义降级为旧兼容别名，优先级低于新模式。

**Tech Stack:** TypeScript, Zod, Vitest, pnpm, Docker Compose

---

### Task 1: 定义网络模式环境变量契约

**Files:**

- Modify: `src/server/infra/env.ts`
- Test: `src/test/server/env.test.ts`

- [ ] **Step 1: 写失败测试覆盖新环境变量解析**

```ts
it('defaults RSS_NETWORK_MODE to public with empty allowed cidrs', () => {
  const env = parseEnv({ DATABASE_URL: 'postgres://example' });
  expect(env.RSS_NETWORK_MODE).toBe('public');
  expect(env.RSS_ALLOWED_CIDRS).toEqual([]);
});

it('parses RSS_NETWORK_MODE and RSS_ALLOWED_CIDRS', () => {
  const env = parseEnv({
    DATABASE_URL: 'postgres://example',
    RSS_NETWORK_MODE: 'custom',
    RSS_ALLOWED_CIDRS: '192.168.0.0/16,10.0.0.0/8',
  });
  expect(env.RSS_NETWORK_MODE).toBe('custom');
  expect(env.RSS_ALLOWED_CIDRS).toEqual(['192.168.0.0/16', '10.0.0.0/8']);
});
```

- [ ] **Step 2: 运行 env 测试确认失败**

Run: `pnpm test:unit -- --run src/test/server/env.test.ts`
Expected: FAIL，提示 `RSS_NETWORK_MODE` 或 `RSS_ALLOWED_CIDRS` 断言不成立。

- [ ] **Step 3: 写最小实现**

```ts
const rssNetworkModeSchema = z
  .preprocess((value) => (typeof value === 'string' ? value.trim().toLowerCase() : value), z.enum(['public', 'fake-ip', 'lan', 'custom']).default('public'));

const rssAllowedCidrsSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}, z.array(z.string()).default([]));
```

- [ ] **Step 4: 运行 env 测试确认通过**

Run: `pnpm test:unit -- --run src/test/server/env.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/server/infra/env.ts src/test/server/env.test.ts
git commit -m "feat(rss): 添加网络模式环境变量契约" -m $'- 添加 RSS_NETWORK_MODE 与 RSS_ALLOWED_CIDRS 解析\n- 保持旧 fake-ip 开关兼容并补充测试'
```

### Task 2: 扩展 ssrfGuard 的放行策略

**Files:**

- Modify: `src/server/integrations/rss/ssrfGuard.ts`
- Test: `src/test/server/rss/ssrfGuard.test.ts`

- [ ] **Step 1: 写失败测试覆盖 fake-ip/lan/custom 模式**

```ts
it('accepts RFC1918 addresses in lan mode', async () => {
  vi.stubEnv('RSS_NETWORK_MODE', 'lan');
  await expect(isSafeExternalUrl('http://192.168.1.10/feed')).resolves.toBe(true);
});

it('accepts explicitly allowed CIDRs in custom mode', async () => {
  vi.stubEnv('RSS_NETWORK_MODE', 'custom');
  vi.stubEnv('RSS_ALLOWED_CIDRS', '100.64.0.0/10');
  await expect(isSafeExternalUrl('http://100.64.1.2/feed')).resolves.toBe(true);
});
```

- [ ] **Step 2: 运行 ssrfGuard 测试确认失败**

Run: `pnpm test:unit -- --run src/test/server/rss/ssrfGuard.test.ts`
Expected: FAIL，新增 `lan/custom` 用例未通过。

- [ ] **Step 3: 写最小实现**

```ts
function isAllowedIp(ip: string, options?: { allowLoopback?: boolean }): boolean {
  const config = getRssNetworkConfig(process.env as Record<string, unknown>);
  if (range === 'unicast') return true;
  if (matchesFakeIp(config, addr, range)) return true;
  if (matchesLan(config, addr, range)) return true;
  if (matchesCustomCidrs(config, addr)) return true;
  if (options?.allowLoopback && range === 'loopback') return true;
  return false;
}
```

- [ ] **Step 4: 运行 ssrfGuard 测试确认通过**

Run: `pnpm test:unit -- --run src/test/server/rss/ssrfGuard.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/server/integrations/rss/ssrfGuard.ts src/test/server/rss/ssrfGuard.test.ts
git commit -m "feat(rss): 扩展网络访问模式校验" -m $'- 添加 fake-ip lan custom 分级放行策略\n- 保持默认 public 限制并补充回归测试'
```

### Task 3: 同步部署配置和文档

**Files:**

- Modify: `.env.example`
- Modify: `deploy/.env.example`
- Modify: `docker-compose.yml`
- Modify: `deploy/compose.yaml`
- Modify: `docs/development.md`
- Modify: `docs/deploy.md`

- [ ] **Step 1: 更新示例 env 和 compose 注入项**

```env
RSS_NETWORK_MODE=public
RSS_ALLOWED_CIDRS=
RSS_ALLOW_FAKE_IP=false
```

- [ ] **Step 2: 更新开发与部署文档**

```md
- `RSS_NETWORK_MODE=public`
- `RSS_ALLOWED_CIDRS=`

可选模式：

- `public`：默认，仅允许公网地址
- `fake-ip`：额外允许 `198.18.0.0/15`
- `lan`：额外允许常见 RFC1918 局域网地址
- `custom`：只额外允许 `RSS_ALLOWED_CIDRS` 中的网段
```

- [ ] **Step 3: 检查文档与配置文件 diff**

Run: `git diff -- .env.example deploy/.env.example docker-compose.yml deploy/compose.yaml docs/development.md docs/deploy.md`
Expected: 只包含新网络模式相关说明与环境注入。

- [ ] **Step 4: 提交**

```bash
git add .env.example deploy/.env.example docker-compose.yml deploy/compose.yaml docs/development.md docs/deploy.md
git commit -m "docs(deploy): 更新 RSS 网络模式配置说明" -m $'- 添加 RSS_NETWORK_MODE 与 RSS_ALLOWED_CIDRS 示例\n- 同步 compose 注入和开发部署文档'
```

### Task 4: 运行完整验证并收尾

**Files:**

- Test: `src/test/server/env.test.ts`
- Test: `src/test/server/rss/ssrfGuard.test.ts`
- Test: `src/test/app/api/rss/validate/route.test.ts`
- Test: `src/test/app/api/feeds/routes.test.ts`
- Test: `src/test/features/feeds/services/rssValidationService.test.ts`

- [ ] **Step 1: 运行相关测试**

Run: `pnpm test:unit`
Expected: PASS

- [ ] **Step 2: 运行静态检查**

Run: `pnpm lint && pnpm type-check`
Expected: PASS

- [ ] **Step 3: 确认 spec 决策**

```text
如果只是环境变量扩展与安全策略细化，但没有改变长期模块边界，则记录 superwork-update-spec = no-update。
```

- [ ] **Step 4: 提交**

```bash
git add .
git commit -m "feat(rss): 支持分级网络访问模式" -m $'- 添加 public fake-ip lan custom RSS 网络模式\n- 更新部署配置与回归测试覆盖安全策略'
```
