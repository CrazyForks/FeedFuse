# 跨层边界

## 前端与后端的分界

- `src/app/api/**` 是 HTTP 入口，不在这里堆业务细节
- 业务规则优先放到 `src/server/domains/**/services/**`
- 持久化细节优先放到 `src/server/domains/**/repositories/**`
- 前端通过 `src/lib/api/apiClient.ts` 或同类客户端封装访问接口，不直接拼散落的请求逻辑

## Worker 与服务层的分界

- `src/worker/**` 负责调度、轮询、任务推进
- 可复用业务逻辑放回 `src/server/domains/**/services/**`、`src/server/integrations/ai/**`、`src/server/integrations/rss/**`
- 不要把数据库查询细节复制到 worker 内

## 共享模块的分界

- `src/lib/**`、`src/utils/**`、`src/types/**` 保持小而稳定
- 共享模块不要偷偷依赖页面组件、`Next.js` 路由上下文或数据库连接
- 一旦共享模块开始携带某一层特有状态，就应回退到对应层目录

## 变更顺序建议

跨层任务尽量按这个顺序推进：

1. 明确共享类型或 API 合约
2. 调整 `src/server` 或 `src/app/api`
3. 调整 `src/lib/api/apiClient.ts` 或前端数据消费
4. 最后补 UI 状态与交互细节
