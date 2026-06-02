# 仓库地图

## 项目形态

- 根目录是单个 `pnpm` 包，入口配置见 `package.json`
- UI 与 API 共用 `Next.js` 应用，主入口在 `src/app`
- 后台异步任务独立在 `src/worker`
- 数据访问与业务逻辑集中在 `src/server`
- 共享代码集中在 `src/lib`、`src/utils`、`src/types`、`src/data`、`src/mock`，但其中一部分只服务前端侧复用

## 关键目录

- `src/app/(reader)`：主阅读器页面与页面级测试
- `src/app/login`：登录页面
- `src/app/api`：Next.js Route Handlers，HTTP 入口
- `src/features`：按业务拆分的前端功能模块
- `src/components/ui`：通用 UI 基件
- `src/store`：客户端状态
- `src/hooks`：前端 hooks
- `src/lib/api`：浏览器侧 API client、错误映射和轮询工具
- `src/lib/ui`：前端共享设计 token 与 class 常量
- `src/lib/reader`、`src/lib/feeds`：阅读器 / 订阅领域 helper，部分会被前后端共同消费
- `src/utils`、`src/types`：基础工具与共享类型
- `src/data/provider`、`src/data/mock`、`src/mock`：阅读数据 provider 与 mock 样本
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
- 全新数据库首次登录依赖 `AUTH_INITIAL_PASSWORD`，默认管理员用户名固定为 `admin`
- 涉及数据库验证时，需要 `DATABASE_URL`
