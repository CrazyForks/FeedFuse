# 仓库地图

## 项目形态

- 根目录是单个 `pnpm` 包，入口配置见 `package.json`
- UI 与 API 共用 `Next.js` 应用，主入口在 `src/app`
- 后台异步任务独立在 `src/worker`
- 数据访问与业务逻辑集中在 `src/server`
- 共享前后端的轻量工具和类型集中在 `src/lib`、`src/utils`、`src/types`、`src/data`

## 关键目录

- `src/app/(reader)`：主阅读器页面与页面级测试
- `src/app/login`：登录页面
- `src/app/api`：Next.js Route Handlers，HTTP 入口
- `src/features`：按业务拆分的前端功能模块
- `src/components/ui`：通用 UI 基件
- `src/store`：客户端状态
- `src/hooks`：前端 hooks
- `src/server/domains/*/services`：业务服务编排
- `src/server/domains/*/repositories`：数据库读写
- `src/server/infra/db/migrations`：SQL 迁移与迁移测试
- `src/server/integrations/ai`：AI 能力封装
- `src/server/integrations/rss`、`src/server/integrations/fulltext`、`src/server/integrations/media`：抓取与内容处理
- `src/server/infra/queue`：任务队列契约与启动逻辑
- `src/worker`：后台任务调度与执行
- `scripts/db/migrate.mjs`：数据库迁移执行入口

## 常用命令

- 安装依赖：`pnpm install`
- 启动 Web：`pnpm dev`
- 启动 Worker：`pnpm worker:dev`
- 静态检查：`pnpm lint`
- 类型检查：`pnpm type-check`
- 单元测试：`pnpm test:unit`
- 生产构建：`pnpm build`
- 执行迁移：`node scripts/db/migrate.mjs`

## 运行前提

- Node 版本要求见 `package.json` 与 `docs/development.md`
- 包管理器固定为 `pnpm@10`
- 本地开发依赖 PostgreSQL 16，示例环境变量见 `.env.example`
- 涉及数据库验证时，需要 `DATABASE_URL`
