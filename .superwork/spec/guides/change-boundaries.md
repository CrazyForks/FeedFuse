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

- `src/lib/api/**`、`src/lib/ui/**` 是前端侧共享支撑，不要反向依赖 `src/features/**`、`src/components/**` 或 `src/server/**`
- `src/lib/reader/**`、`src/lib/feeds/**`、`src/utils/**`、`src/types/**` 优先保持小而稳定；需要跨层复用时，尽量保持运行环境无关
- `src/data/**`、`src/mock/**` 只放 provider、mock 数据和测试支撑，不在这里藏真实数据库、网络抓取或 Route 状态
- 一旦逻辑只被单个 feature、单个 route 或单个 service 使用，就回退到对应层目录

## 变更顺序建议

跨层任务尽量按这个顺序推进：

1. 明确共享类型或 API 合约
2. 调整 `src/server` 或 `src/app/api`
3. 调整 `src/lib/api/apiClient.ts`、`src/store/**` 或前端数据消费
4. 最后补 UI 状态与交互细节
