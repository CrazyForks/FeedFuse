# RSS Fake-IP 兼容 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让本地部署场景下的 RSS URL 校验兼容 `198.18.0.0/15` fake-ip，同时把“链接格式错误”和“安全策略拦截”拆成不同错误语义。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — 共享工作规则与验证入口
- `.superwork/spec/guides/change-boundaries.md` — 约束 route、shared client 与 server guard 的职责边界
- `.superwork/spec/guides/verification.md` — 本次 API、server、worker 与前端测试基线
- `.superwork/spec/backend/index.md` — 后端入口、worker 与测试范围
- `.superwork/spec/backend/contracts.md` — route 错误契约与 worker 复用约束
- `.superwork/spec/frontend/index.md` — 前端 API 消费与镜像测试范围
- `.superwork/spec/frontend/contracts.md` — 前端错误文案与 API client 契约

**Architecture:** 保持 `isSafeExternalUrl` 的主逻辑不变，只为 `198.18.0.0/15` 增加一个默认开启的可配置兼容分支。RSS 校验接口新增单独错误码承接安全拦截，前端保留统一校验流，但展示更准确的提示文案。

**Tech Stack:** TypeScript, Next.js route handlers, Vitest, ipaddr.js

---

### Task 1: 定义 fake-ip 兼容与 RSS 安全错误语义

**Files:**

- Modify: `src/server/integrations/rss/ssrfGuard.ts`
- Modify: `src/app/api/rss/validate/route.ts`
- Modify: `src/lib/api/apiClient.ts`
- Test: `src/test/server/rss/ssrfGuard.test.ts`
- Test: `src/test/app/api/rss/validate/route.test.ts`
- Test: `src/test/features/feeds/services/rssValidationService.test.ts`

- [ ] **Step 1: 写失败测试覆盖 fake-ip 与新错误码**

```ts
it('accepts fake-ip addresses when compatibility is enabled', async () => {
  vi.stubEnv('RSS_ALLOW_FAKE_IP', 'true');
  await expect(isSafeExternalUrl('http://198.18.0.1/feed')).resolves.toBe(true);
});

it('returns unsafe_url when rss guard blocks the link', async () => {
  isSafeExternalUrlMock.mockResolvedValue(false);
  const response = await mod.GET(new Request('http://localhost/api/rss/validate?url=https%3A%2F%2Fexample.com%2Frss.xml'));
  expect(await response.json()).toEqual({
    ok: true,
    data: {
      valid: false,
      reason: 'unsafe_url',
      message: '当前网络环境不允许访问该链接',
    },
  });
});
```

- [ ] **Step 2: 运行针对性测试并确认失败**

Run: `pnpm test:unit -- --run src/test/server/rss/ssrfGuard.test.ts src/test/app/api/rss/validate/route.test.ts src/test/features/feeds/services/rssValidationService.test.ts`
Expected: FAIL，提示 fake-ip 未放行且 `unsafe_url` 未定义。

- [ ] **Step 3: 实现最小兼容逻辑与错误码**

```ts
const FAKE_IP_CIDRS = [['198.18.0.0', 15]] as const;

function isFakeIp(ip: string): boolean {
  const addr = ipaddr.parse(ip);
  return FAKE_IP_CIDRS.some(([base, prefix]) => addr.match(ipaddr.parse(base), prefix));
}

function isFakeIpCompatEnabled(): boolean {
  return process.env.RSS_ALLOW_FAKE_IP?.trim() !== 'false';
}

if (range === 'reserved' && isFakeIpCompatEnabled() && isFakeIp(ip)) {
  return true;
}
```

- [ ] **Step 4: 运行针对性测试并确认通过**

Run: `pnpm test:unit -- --run src/test/server/rss/ssrfGuard.test.ts src/test/app/api/rss/validate/route.test.ts src/test/features/feeds/services/rssValidationService.test.ts`
Expected: PASS

- [ ] **Step 5: 提交阶段性改动**

```bash
git add src/server/integrations/rss/ssrfGuard.ts src/app/api/rss/validate/route.ts src/lib/api/apiClient.ts src/test/server/rss/ssrfGuard.test.ts src/test/app/api/rss/validate/route.test.ts src/test/features/feeds/services/rssValidationService.test.ts
git commit -m "fix(rss): 支持 fake-ip 链接校验" -m $'- 添加 198.18.0.0/15 定向兼容逻辑\n- 区分格式错误与安全策略拦截返回语义'
```

### Task 2: 让新增/编辑订阅提交错误返回更准确文案

**Files:**

- Modify: `src/app/api/feeds/route.ts`
- Modify: `src/app/api/feeds/[id]/route.ts`
- Modify: `src/test/app/api/feeds/routes.test.ts`

- [ ] **Step 1: 写失败测试约束新增/编辑时的字段错误文案**

```ts
expect(json.error.fields.url).toBe('当前网络环境不允许访问该链接');
```

- [ ] **Step 2: 运行针对性测试并确认失败**

Run: `pnpm test:unit -- --run src/test/app/api/feeds/routes.test.ts`
Expected: FAIL，当前仍返回 `Unsafe URL`。

- [ ] **Step 3: 实现最小错误文案映射**

```ts
const error = new ValidationError('Invalid request body', {
  url: '当前网络环境不允许访问该链接',
});
```

- [ ] **Step 4: 运行针对性测试并确认通过**

Run: `pnpm test:unit -- --run src/test/app/api/feeds/routes.test.ts`
Expected: PASS

- [ ] **Step 5: 提交阶段性改动**

```bash
git add src/app/api/feeds/route.ts src/app/api/feeds/[id]/route.ts src/test/app/api/feeds/routes.test.ts
git commit -m "fix(feeds): 更新订阅链接拦截提示" -m $'- 更新新增与编辑订阅的 URL 字段错误文案\n- 保持路由层只负责边界错误映射'
```

### Task 3: 补充部署文档与回归验证

**Files:**

- Modify: `.env.example`
- Modify: `docs/development.md`

- [ ] **Step 1: 更新默认环境变量说明**

```env
RSS_ALLOW_FAKE_IP=true
```

- [ ] **Step 2: 运行本次改动的回归命令**

Run: `pnpm lint`
Expected: PASS

Run: `pnpm type-check`
Expected: PASS

Run: `pnpm test:unit -- --run src/test/server/rss/ssrfGuard.test.ts src/test/app/api/rss/validate/route.test.ts src/test/features/feeds/services/rssValidationService.test.ts src/test/app/api/feeds/routes.test.ts`
Expected: PASS

- [ ] **Step 3: 提交文档与配置说明**

```bash
git add .env.example docs/development.md
git commit -m "docs(deploy): 补充 fake-ip 兼容说明" -m $'- 添加 RSS_ALLOW_FAKE_IP 默认配置示例\n- 更新本地开发环境变量说明'
```
