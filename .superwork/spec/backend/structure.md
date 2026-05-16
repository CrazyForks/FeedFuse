# 后端结构约束

## HTTP 入口

- `src/app/api/**` 负责解析请求、调用服务、返回响应
- 公共 HTTP 错误与响应格式优先复用 `src/server/infra/http/**`
- 不要把 SQL、复杂业务分支或长轮询细节直接写进 `route.ts`

## 服务与仓储

- `src/server/domains/**/services/**` 放业务编排和跨仓储流程
- `src/server/domains/**/repositories/**` 放数据库访问
- `src/server/infra/db/pool.ts` 负责连接池基础设施
- `src/server/infra/db/migrations/**` 放 schema 变更和迁移回归测试

## 领域能力

- `src/server/integrations/rss/**` 处理 RSS 拉取与解析
- `src/server/integrations/fulltext/**` 处理正文抓取与抽取
- `src/server/integrations/ai/**` 处理 AI 摘要、翻译、解读相关能力
- `src/server/integrations/media/**` 处理图片代理与 HTML 图片改写
- `src/server/infra/logging/**`、`src/server/domains/**/tasks/**` 放日志和任务错误映射

## 异步任务

- `src/worker/**` 负责后台流程推进
- `src/server/infra/queue/**` 负责任务契约和可复用队列逻辑
- 可以沉到服务层的逻辑，不要长期堆在 worker 文件里
