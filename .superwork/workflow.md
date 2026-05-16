# FeedFuse Superwork Workflow

## 何时使用 `superwork-init`

仅在以下情况重新使用 `superwork-init`：

- `.superwork/` 不存在
- `.superwork/workflow.md` 缺失
- `.superwork/spec/` 缺少当前仓库需要的 `guides`、`frontend`、`backend`、`shared` 索引
- 项目结构发生明显变化，例如从单包改成多包，或新增独立服务层

当前仓库是单个 `pnpm` 包，不需要拆成 monorepo 规格树。

## 正常入口：先用 `superwork-start`

初始化完成后，任何新任务都先用 `superwork-start`。它的作用是：

- 读取 `.superwork/spec/guides/` 和相关层文档
- 明确这次任务属于 `frontend`、`backend`、`shared` 还是跨层改动
- 先确认验证范围，再开始改代码

不要跳过这一步直接凭记忆修改，尤其是同时涉及 `src/app/api`、`src/server`、`src/worker` 的任务。

## 设计重的功能先走 `superwork-brainstorming`

先用 `superwork-brainstorming` 的场景：

- 新增完整阅读流程、AI 能力或设置中心交互
- 变更数据模型、队列流程或 API 语义
- 同时改动 `ReaderApp`、`apiClient`、`route.ts`、`services`、`repositories`

这类任务如果直接写代码，后面通常会返工到接口边界或状态流转。

## 何时使用 `superwork-using-git-worktrees`

优先在以下场景使用 `superwork-using-git-worktrees`：

- 任务会持续多轮并且改动面大
- 需要并行保留其他分支工作
- 需要隔离大规模重构、迁移或 UI 重排

小修复可以直接在当前工作区完成，但复杂任务用独立 worktree 更稳。

## 计划类任务：`superwork-writing-plans` 与 `superwork-executing-plans`

当需求已经清楚，但实现步骤较多时：

1. 先用 `superwork-writing-plans` 写执行计划
2. 再用 `superwork-executing-plans` 按顺序落地

适合这类任务：

- 新增或重构 `src/server/domains/**/services/**` 与 `src/server/domains/**/repositories/**`
- 批量调整 `src/features/**` 与 `src/components/ui/**`
- 引入新迁移文件并同步路由、服务、前端状态

## 可以直接实现时，仍默认走 `superwork-tdd`

即使不需要单独写计划，直接开发也优先用 `superwork-tdd`。原因很简单：

- 这个仓库测试分布清晰，`vitest` 已覆盖 `frontend`、`api`、`server`、`worker`
- 很多改动都能先从现有测试旁边补一个失败用例开始
- `pnpm test:unit`、`pnpm lint`、`pnpm type-check` 都是现成的回归入口

## Bugfix 默认使用 `superwork-debugging`

修 bug 不要先猜。默认先走 `superwork-debugging`，尤其是下面几类：

- `route.ts` 返回值和前端预期不一致
- `worker` 异步任务状态异常
- `repositories` 查询边界或 migration 回归
- AI、翻译、全文抓取这类多阶段流程

先定位触发链路，再改实现。

## 完成前必须执行 `superwork-check`

任何任务收尾都必须走 `superwork-check`，因为这个仓库至少要确认：

- 相关层的 `pnpm lint`
- 相关层的 `pnpm type-check`
- 相关测试，通常是 `pnpm test:unit`
- 如果改动触及打包、运行入口或全局样式，再补 `pnpm build`

涉及数据库、`repositories.integration.test.ts` 或真实迁移时，还要确认 `DATABASE_URL` 与迁移状态。

`superwork-check` 同时负责决定是否进入 `superwork-code-simplifier`：

- 中等或较大 diff 必须执行 `superwork-code-simplifier`
- 只有真正很小的 diff 才能跳过，并写明跳过原因
- 简化后仍要回到 `superwork-check` 跑必要验证

## 完成前必须显式决定 `superwork-update-spec`

交付前必须明确选择以下三种之一：

- `update`：现有规格需要更新
- `create`：需要新增规格文档
- `no-update`：这次改动不改变长期规则

不要默认更新文档，也不要默认跳过。只在以下情况更新规格：

- 新增长期保留的模块边界
- 调整 API / service / repository 合约
- 改变验证命令、目录职责或迁移流程

## 推荐执行顺序

1. `.superwork/` 缺失或损坏：`superwork-init`
2. 正常任务开始：`superwork-start`
3. 设计不清：`superwork-brainstorming`
4. 需要隔离工作区：`superwork-using-git-worktrees`
5. 需要明确步骤：`superwork-writing-plans`
6. 落地执行：`superwork-executing-plans` 或直接 `superwork-tdd`
7. 修 bug：`superwork-debugging`
8. 必做 `superwork-check`
9. 由 `superwork-check` 决定是否执行 `superwork-code-simplifier`
10. 必做 `superwork-update-spec` 决策

下一次进入这个仓库，默认从 `superwork-start` 开始。
