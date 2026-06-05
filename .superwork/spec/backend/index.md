# 后端层索引

## Scope

`backend` 层覆盖 HTTP 入口、服务编排、数据库、抓取、AI、队列和后台任务，主要包括：

- `src/app/api/**`
- `src/server/**`
- `src/worker/**`
- `scripts/db/migrate.mjs`

相关支撑文档：

- [结构约束](./structure.md)
- [质量门槛](./quality.md)
- [接口与数据契约](./contracts.md)

## Pre-Development Checklist

- 阅读 [../guides/change-boundaries.md](../guides/change-boundaries.md)，确认改动是在 route、service、repository 还是 worker
- 如果是登录、会话、用户权限或删除用户相关改动，先看 `src/app/api/auth/**`、`src/app/api/users/**`、`src/server/domains/auth/**`
- 如果是接口改动，先看对应 `src/app/api/**/route.ts` 和 `src/test/app/api/**` 下镜像测试
- 如果是业务规则改动，先看 `src/server/domains/**/services/**`
- 如果是持久化改动，先看 `src/server/domains/**/repositories/**`、`src/server/infra/db/migrations/**`
- 如果是异步流程改动，先看 `src/worker/index.ts`、对应 worker 文件、`src/server/infra/queue/**`
- 涉及环境变量或运行依赖时，先看 `src/server/infra/env.ts`、`.env.example`、`docs/development.md`

## Verification Checklist

- 跑对应 `src/test/app/api/**/route.test.ts` / `src/test/app/api/**/routes.test.ts` / `src/test/server/**/*.test.ts` / `src/test/worker/**/*.test.ts`
- 执行 `pnpm lint`
- 执行 `pnpm type-check`
- 改动影响跨层行为或覆盖面不清时，执行 `pnpm test:unit`
- 改动运行入口、构建产物或 Next.js server 行为时，执行 `pnpm build`
- 改动 migration 或真实数据库查询时，确认 `DATABASE_URL`，必要时检查 `node scripts/db/migrate.mjs`

## Update Triggers

以下情况需要回写或新增后端规格：

- 新增 API 资源、服务层边界或队列任务类型
- 改变 route -> service -> repository 的职责切分
- 新增或调整数据库表、迁移顺序、环境变量要求
- 改变 worker 调度策略、AI 流程阶段或错误映射约定
