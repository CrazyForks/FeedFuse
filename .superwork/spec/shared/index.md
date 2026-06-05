# 共享层索引

## Scope

`shared` 层覆盖被多个模块复用的轻量契约、helper、client 和 mock/provider 支撑，不要求全部跨运行环境。当前仓库里，`src/lib/api/**`、`src/lib/ui/**` 明确是前端侧共享；`src/lib/reader/**`、`src/lib/feeds/**`、`src/utils/**`、`src/types/**` 中有一部分会被前后端共同消费。主要范围：

- `src/lib/**`
- `src/utils/**`
- `src/types/**`
- `src/data/**`
- `src/mock/**`

相关支撑文档：

- [结构约束](./structure.md)
- [质量门槛](./quality.md)

## Pre-Development Checklist

- 阅读 [../guides/change-boundaries.md](../guides/change-boundaries.md)，确认这段逻辑是否真的应该共享
- 如果改动是 API 客户端或错误映射，先看 `src/lib/api/apiClient.ts`、`src/lib/api/apiErrorNotifier.ts`、`src/lib/api/mapApiErrorToUserMessage.ts`，以及 `src/test/lib/**` 与相关 store / feature 消费测试
- 如果改动是设计 token 或共享 class 常量，先看 `src/lib/ui/designSystem.ts`、`src/test/app/theme-token-usage.contract.test.ts`、`src/test/components/ui/**`
- 如果改动是阅读器或订阅领域 helper，先看 `src/lib/reader/**`、`src/lib/feeds/**` 及其消费方
- 如果改动是纯工具，先看 `src/utils/**` 与 `src/test/utils/**` 镜像测试
- 如果改动是通用类型，先看 `src/types/index.ts`
- 如果改动是数据提供层或 mock，先看 `src/data/provider/readerDataProvider.ts`、`src/data/mock/mockProvider.ts`、`src/mock/data.ts`

## Verification Checklist

- 跑相关 `src/test/lib/**`、`src/test/utils/**`、`src/test/data/**` 测试
- 改 `src/lib/api/**` 时，补跑受影响的 `src/test/store/**` 或 feature 测试
- 改 `src/lib/ui/designSystem.ts` 时，补跑 `src/test/app/theme-token-usage.contract.test.ts` 与相关 UI 合约测试
- 执行 `pnpm lint`
- 执行 `pnpm type-check`
- 如果共享改动被前端和后端同时消费，执行 `pnpm test:unit`

## Update Triggers

以下情况需要回写或新增共享规格：

- 新增稳定复用的 helper、类型集合或数据提供契约
- 改变 API client、错误映射、轮询、设计 token、阅读器 helper 等公共语义
- 把原本前端或后端私有的逻辑提升为共享模块
