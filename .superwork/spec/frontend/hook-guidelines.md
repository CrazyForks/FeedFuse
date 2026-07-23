# 前端 Hook 规范

## 放置与命名

- 单个业务域使用的 Hook 放 `src/features/<domain>/hooks/**`
- 多个业务域复用的 Hook 放 `src/hooks/**`，名称统一使用 `use*`
- 组件私有 Hook 放在组件邻近的 `hooks` 目录，不提升到全局

## 副作用规则

- Hook 对外显式返回 loading、error、数据和操作状态，不让调用方猜测阶段
- `useEffect` 订阅、计时器、AbortController 与流式请求必须提供清理逻辑
- 依赖数组保持真实完整；需要稳定回调时使用 `useCallback`，不通过忽略 lint 掩盖闭包问题
- 自动保存、轮询、摘要流和沉浸式翻译优先沿用现有 Hook 的并发与取消语义
- Hook 行为变更时在 `src/test/hooks/**` 或对应 feature 镜像目录补测试
