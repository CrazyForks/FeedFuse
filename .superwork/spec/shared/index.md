# Shared Index

## Scope

`shared` 层覆盖被多个层复用、且不应绑定单一运行环境的类型、工具和数据适配逻辑，主要包括：

- `src/lib/**`
- `src/utils/**`
- `src/types/**`
- `src/data/**`

相关支撑文档：

- [结构约束](./structure.md)
- [质量门槛](./quality.md)

## Pre-Development Checklist

- 阅读 [../guides/change-boundaries.md](../guides/change-boundaries.md)，确认这段逻辑是否真的应该共享
- 如果改动是 API 客户端或错误映射，先看 `src/lib/api/apiClient.ts`、`src/lib/api/apiErrorNotifier.ts`、`src/lib/api/mapApiErrorToUserMessage.ts`
- 如果改动是纯工具，先看 `src/utils/**` 与 `src/test/utils/**` 镜像测试
- 如果改动是通用类型，先看 `src/types/index.ts`
- 如果改动是数据提供层或 mock，先看 `src/data/**`、`src/mock/data.ts`

## Verification Checklist

- 跑相关 `src/test/lib/**/*.test.ts`、`src/test/utils/**/*.test.ts`、`src/test/data/**/*.test.ts`
- 执行 `pnpm lint`
- 执行 `pnpm type-check`
- 如果共享改动被前端和后端同时消费，执行 `pnpm test:unit`

## Update Triggers

以下情况需要回写或新增共享规格：

- 新增稳定复用的 helper、类型集合或数据提供契约
- 改变错误映射、轮询、摘要、日期等公共工具语义
- 把原本前端或后端私有的逻辑提升为共享模块
