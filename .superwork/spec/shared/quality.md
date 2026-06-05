# 共享质量门槛

## 实现要求

- `src/utils/**`、`src/types/**`、`src/lib/reader/**`、`src/lib/feeds/**` 优先保持显式输入输出，尽量不要携带浏览器、数据库或队列细节
- `src/lib/api/**` 统一维护请求封装、错误映射、鉴权跳转和响应 envelope；不要在 `src/features/**`、`src/store/**` 里散落重复 `fetch` 逻辑
- `src/lib/ui/**` 统一维护设计 token 和共享 class 常量；不要在业务组件里复制长串样式常量
- `src/data/**`、`src/mock/**` 里的 provider / mock 数据要跟 `src/types/index.ts` 中的实体结构保持一致

## 测试要求

- 共享 helper 变更时，`src/test` 下对应镜像测试必须一起更新
- 涉及边界条件的工具函数，至少覆盖正常输入、空输入和异常输入
- 共享 API 客户端语义变更时，补看 store、feature 和登录 / 设置等前端消费测试是否也要同步
- 共享设计 token 或 class 常量变更时，至少检查主题 token、popup surface 和相关组件契约测试

## 类型契约要求

- 新增跨层业务实体（如自动化规则）时，结构与字段语义统一定义在 `src/types/index.ts`，避免在 frontend/backend 各自复制声明。
- 共享类型字段新增后，至少同步检查 API route 测试与组件消费测试，确保请求/响应与 UI 消费一致。
- 用户身份展示或权限分支新增共享字段时，必须优先落到 `src/types/index.ts`，并让 API route、`src/lib/api/apiClient.ts`、前端消费测试同步对齐，避免前后端各自推导角色语义。
