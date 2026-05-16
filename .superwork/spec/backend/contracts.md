# 后端接口与数据契约

## Route 到 Service

- `src/app/api/**/route.ts` 只保留请求边界逻辑
- 可复用业务流程进入 `src/server/domains/**/services/**`
- 响应格式尽量通过 `src/server/infra/http/apiResponse.ts` 等公共工具统一

## Service 到 Repository

- service 负责业务顺序、幂等规则、跨模块编排
- repository 负责查询与持久化，不承载页面语义
- 新增字段或筛选规则时，优先把断言落在 repository / service 测试

## Worker 到 Domain

- worker 任务应复用 `src/server/domains/**/services/**`、`src/server/integrations/ai/**`、`src/server/integrations/rss/**`
- 队列任务名字、状态和错误语义变更时，检查 `src/server/infra/queue/contracts.ts`、`src/server/domains/**/tasks/**`、前端轮询消费方
- AI 摘要/翻译提示词来自 `ui_settings.ai.summaryPrompt`、`ui_settings.ai.translationPrompt`；为空时必须在 `src/server/integrations/ai/**` 统一回退默认模板，不在 route/worker 内硬编码默认词

## 数据与迁移

- schema 变化必须同步更新 `src/server/infra/db/migrations/**`
- 需要启动期迁移时，入口保持通过 `scripts/db/migrate.mjs`
- 改变环境变量契约时，同步检查 `.env.example`、`docs/development.md`、部署文档

## 订阅源自动化契约

- 订阅源自动化字段属于 `Feed` / feed DTO 合约，包括 `fullTextOnOpenEnabled`、`fullTextOnFetchEnabled`、`aiSummaryOnOpenEnabled`、`aiSummaryOnFetchEnabled`、`bodyTranslateOnFetchEnabled`、`bodyTranslateOnOpenEnabled`、`titleTranslateEnabled`、`bodyTranslateEnabled`。
- `src/app/api/feeds/**` 只负责请求边界和响应 DTO；字段持久化落在 `src/server/domains/feeds/repositories/feedsRepo.ts`，业务编排优先放在 `src/server/domains/feeds/services/**`。
- 入库链路的自动 AI 触发统一走 `src/worker/autoAiTriggers.ts`，只根据 `aiSummaryOnFetchEnabled`、`bodyTranslateOnFetchEnabled` 和文章已有内容决定是否入队。
- 打开文章链路通过 `src/app/api/articles/[id]/fulltext/route.ts`、`ai-summary/route.ts`、`ai-translate/route.ts` 创建 `article_tasks`，状态由 `src/app/api/articles/[id]/tasks/route.ts` 返回给前端轮询。
- AI 摘要/翻译提示词来自 `ui_settings.ai.summaryPrompt`、`ui_settings.ai.translationPrompt`；为空时必须在 `src/server/integrations/ai/**` 统一回退默认模板，不在 route/worker 内硬编码默认词。
