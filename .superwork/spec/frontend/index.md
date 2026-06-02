# 前端层索引

## Scope

`frontend` 层覆盖用户可见界面、客户端状态和交互流程，主要包括：

- `src/app/(reader)`
- `src/app/login`
- `src/features/**`
- `src/components/**`
- `src/hooks/**`
- `src/store/**`
- `src/app/globals.css`

相关支撑文档：

- [结构约束](./structure.md)
- [质量门槛](./quality.md)
- [交互与接口契约](./contracts.md)

## Pre-Development Checklist

- 阅读 [../guides/repo-map.md](../guides/repo-map.md)，确认这次改动只在前端层内，还是会连带 `src/app/api` / `src/server`
- 打开 `src/app/(reader)/ReaderApp.tsx` 或对应页面入口，确认状态流是从哪里开始的
- 打开相关 feature 目录，例如 `src/features/articles`、`src/features/feeds`、`src/features/settings`
- 如果改动涉及请求或轮询，先看 `src/lib/api/apiClient.ts`、`src/lib/api/polling.ts`；这些文件在 `shared` 目录下，但验证仍按前端链路执行
- 如果改动涉及全局样式或设计 token，先看 `src/app/globals.css`、`src/lib/ui/designSystem.ts`
- 找到 `src/test` 下对应镜像测试文件，优先沿用现有测试风格

## Verification Checklist

- 跑相关前端测试，例如 `pnpm test:unit -- src/test/features/articles/ArticleView.aiSummary.test.tsx`
- 改动跨多个组件或状态流时，至少执行一次 `pnpm test:unit`
- 执行 `pnpm lint`
- 执行 `pnpm type-check`
- 变更页面入口、全局样式、构建期行为时，执行 `pnpm build`

## Update Triggers

以下情况需要回写或新增前端规格：

- 新增长期存在的页面区域、feature 目录或状态容器
- 改变 `src/lib/api/apiClient.ts` 的调用方式或错误处理约定
- 改变 `ReaderApp`、设置中心、文章阅读主流程的交互顺序
- 新增对全局样式、设计 token、主题系统的硬性规则
