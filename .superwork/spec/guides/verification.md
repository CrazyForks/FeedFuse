# 验证策略

## 默认基线

除纯文档修改外，默认至少执行：

- `pnpm lint`
- `pnpm type-check`
- 与改动相关的测试

## 按改动范围追加

### 前端

- 改 `src/features/**`、`src/components/**`、`src/app/(reader)/**`、`src/app/login/**`
- 先跑 `src/test` 镜像目录下相关 `*.test.tsx` / `*.spec.tsx`
- 交互或布局变更较大时，再跑 `pnpm build`

### API / 服务端

- 改 `src/app/api/**`、`src/server/**`
- 先跑 `src/test/app/api/**/route.test.ts`、`src/test/app/api/**/routes.test.ts`、`src/test/server/**/*.test.ts`
- 影响全局响应结构、环境变量或构建行为时，再跑 `pnpm build`

### Worker

- 改 `src/worker/**`
- 先跑对应 `src/test/worker/**/*.test.ts`
- 如果任务依赖 `src/server/domains/**/services/**` 或 `src/server/infra/queue/**`，补跑相关服务或队列测试

### 数据库

- 改 `src/server/infra/db/migrations/**`、`src/server/domains/**/repositories/**`
- 先跑 `src/test/server/db/migrations/**` 与 `src/test/server/repositories/**` 对应测试
- 如果测试依赖真实数据库，确认 `DATABASE_URL` 可用
- 变更迁移逻辑后，至少检查 `scripts/db/migrate.mjs`

## 测试分布提醒

- 测试文件统一放在 `src/test/**`，目录结构与业务代码在 `src/**` 下保持镜像
- `config/vitest/vitest.config.ts` 把 `src/test/server`、`src/test/worker`、`src/test/app/api`、`src/test/lib`、`src/test/utils`、`src/test/data` 里的 `*.test.ts` 归到 `node` 环境
- 其他 `src/test/**/*.{test,spec}.{ts,tsx}` 默认走 `jsdom`
- 通用测试初始化在 `src/test/setup.ts`
