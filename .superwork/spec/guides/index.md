# 通用指南索引

这些文档记录 FeedFuse 全仓库通用且长期有效的开发规则。开始任务时先读取项目事实，再进入对应层规范。

## 入口

- [仓库地图](./repo-map.md)：项目分层、关键目录和运行入口
- [验证策略](./verification.md)：按改动范围选择检查命令
- [跨层边界](./change-boundaries.md)：前端、后端、Worker 与共享代码的职责
- [代码复用检查](./code-reuse-thinking-guide.md)：新增抽象前的复用判断
- [跨层变更检查](./cross-layer-thinking-guide.md)：跨 API、队列和 UI 的契约检查
- [跨平台检查](./cross-platform-thinking-guide.md)：脚本与本地/CI 环境约束

## 开始任务前

- 读取 `.superwork/config.json`，确认包管理器、分层和验证命令
- 按改动范围读取 `frontend`、`backend` 或 `shared` 的 `index.md`
- 同时影响多个层时，先沿数据流确认请求、响应、状态和错误语义
- 通用流程由 Superwork 技能维护；仓库只保存项目事实和长期契约

## 更新时机

- 仓库目录职责、运行入口或验证命令发生长期变化
- 同类问题重复出现，需要沉淀为可执行检查项
- 新增跨层契约，且后续任务必须持续遵守
