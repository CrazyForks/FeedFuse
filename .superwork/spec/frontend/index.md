# 前端层索引

## Scope

`frontend` 层覆盖用户可见界面、客户端状态和交互流程：

- `src/app/(reader)`、`src/app/login`
- `src/features/**`
- `src/components/**`
- `src/hooks/**`
- `src/store/**`
- `src/app/globals.css`

## 规范索引

| 文档 | 内容 |
|---|---|
| [目录结构](./directory-structure.md) | 页面、feature、共享组件和状态的位置 |
| [组件规范](./component-guidelines.md) | 业务组件与 UI 基件的职责 |
| [Hook 规范](./hook-guidelines.md) | Hook 放置、依赖和副作用边界 |
| [状态管理](./state-management.md) | 局部状态、store、服务端状态和用户隔离 |
| [类型安全](./type-safety.md) | API DTO、共享类型与边界校验 |
| [质量指南](./quality-guidelines.md) | 测试、可访问性与视觉回归要求 |
| [长期交互契约](./contracts.md) | 阅读器、用户、订阅、AI 和 Fever 交互语义 |

`structure.md` 与 `quality.md` 保留历史规则，新增规范统一写入上表对应文档，避免继续扩散重复入口。

## 开发前检查

- 从 `src/app/(reader)/ReaderApp.tsx` 或对应页面入口确认状态流
- 定位 `src/features/<domain>` 及 `src/test/features/<domain>` 镜像测试
- 涉及请求、轮询或错误提示时，读取 `src/lib/api/**`
- 涉及全局样式或主题时，读取 `src/app/globals.css` 与 `src/lib/ui/designSystem.ts`
- 新字段或异步状态同时检查 `backend` 与 `shared` 契约
