# FeedFuse Superwork 工作流

## 何时使用 `superwork-init`

只有在以下情况才重新跑 `superwork-init`：

- `.superwork/` 不存在
- `.superwork/workflow.md` 缺失
- `.superwork/spec/guides`、`frontend`、`backend`、`shared` 缺项或明显过期
- 仓库结构发生长期变化，例如拆成多包或新增独立服务层

当前仓库是单个 `pnpm` 包。正常开发不要重复初始化。

## 正常入口：`superwork-start`

除初始化外，所有新任务都先用 `superwork-start`：

- 先读 `.superwork/spec/guides/index.md`
- 再按改动范围进入 `frontend`、`backend`、`shared`
- 先确认验证范围，再开始改代码

同时涉及 `src/app/api`、`src/server`、`src/worker`、`src/features` 的任务，不能跳过这一步。

## Bug 路径：`superwork-debugging`

只要是现有行为异常、测试失败、回归或线上问题，默认先走 `superwork-debugging`。这个仓库里常见的 bug 类型：

- `route.ts` 返回结构与 `src/lib/api/apiClient.ts` 或前端消费不一致
- `src/worker/**` 任务状态、去重或轮询行为异常
- `src/server/domains/**/repositories/**` 查询条件、用户隔离或迁移回归
- AI 摘要、翻译、全文抓取、Fever 同步这类多阶段流程断链

先定位触发链路，再决定修复点。

## 非 Bug 任务分流

非 bug 任务按“能满足质量要求的最短路径”分类，不要把轻任务强行升级成大计划。

### Light

轻任务直接用 `superwork-tdd`，只写内联 TDD 计划，不保存单独计划文档。

适合：

- 单个组件、hook、store、helper、文档的小范围改动
- 单个 route / service / repository 的局部字段或校验调整
- 补一两个针对性测试，或修正文档、注释、路径、命令示例

### Medium

中等任务先用 `superwork-writing-plans`，再用 `superwork-executing-plans`。

适合：

- 同一层内多文件协同改动，但边界已经清楚
- 同时改 `route -> service -> repository` 或 `feature -> store -> apiClient`
- 引入新迁移并同步前后端消费，但整体方案已经明确

### Heavy

重任务先用 `superwork-brainstorming`，再进入 `superwork-writing-plans` 和 `superwork-executing-plans`。

适合：

- 新增完整阅读流程、AI 能力、账号体系或外部服务集成
- 同时改变数据模型、队列语义、API 合约和前端主流程
- 需求还没有收敛，或者跨层边界还不稳定

## 完成策略：统一进入 `superwork-check`

无论是实现任务还是 bugfix，完成后都必须进入 `superwork-check`。在 FeedFuse 里，这一步至少负责：

- 选择需要执行的验证：`pnpm lint`、`pnpm type-check`、相关 `pnpm test:unit`、必要时 `pnpm build`
- 触及数据库、迁移或 `src/test/server/repositories/repositories.integration.test.ts` 时，确认 `DATABASE_URL` 与迁移状态
- 判断是否进入 `superwork-code-simplifier`

`superwork-code-simplifier` 的规则：

- 中等或较大 diff 必须执行
- 只有真正很小的 diff 才能跳过，并明确写出跳过理由
- 简化后必须回到 `superwork-check` 再跑必要验证

## 规格决策：显式做 `superwork-update-spec`

交付前必须明确选择以下之一：

- `update`：现有规格需要更新
- `create`：需要新增规格文档
- `no-update`：这次改动不改变长期规则

只有在下面这些长期事实变化时才更新规格：

- 目录职责、分层边界、共享放置规则发生变化
- API / service / repository / worker 合约发生稳定变化
- 验证命令、迁移流程、权限语义或环境变量要求发生长期变化

## FeedFuse 常见判断规则

- 只改 `.superwork/**` 或 `docs/**`，通常按 light 处理；重点是校验路径、命令、技能名和代码事实一致
- 只改 `src/features/**`、`src/components/**`、`src/store/**`，通常是 frontend 任务
- 只改 `src/app/api/**`、`src/server/**`、`src/worker/**`、迁移文件，通常是 backend 任务
- 改 `src/lib/**`、`src/utils/**`、`src/types/**`、`src/data/**` 时，先确认是否真该放共享层
- 一旦同时碰到 `ReaderApp`、`apiClient`、`route.ts`、service、repository 或 worker，至少按 medium 处理

下一次进入这个仓库，默认从 `superwork-start` 开始。
