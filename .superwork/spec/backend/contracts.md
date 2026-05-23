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

## 播客 RSS 契约

- RSS `<enclosure>` 与 Atom `link rel="enclosure"` 中的 `audio/*`、`video/*` 附件属于文章媒体附件，持久化在 `article_media_attachments`，并通过 `Article.mediaAttachments` 返回给前端。
- 播客文章判定以已解析出的媒体附件为准；图片类附件继续作为 `previewImage` 处理，不进入 `mediaAttachments`。
- 播客文章只支持播放与普通阅读，不触发全文抓取、AI 摘要、正文翻译或文章过滤队列；worker 自动链路和 `fulltext`、`ai-summary`、`ai-translate` 手动 API 都必须返回 no-op。
- 更新播客解析、附件入库或文本自动化屏蔽逻辑时，至少覆盖 RSS/Atom 解析、附件 repository、worker 入库跳过队列、文章 API DTO、文章视图播放与按钮屏蔽测试。

## Fever 同步与写回契约

- `feeds.provider` 是长期存在的来源字段，当前允许值为 `local_rss` 和 `fever`；Fever 上游对象通过 `fever_accounts`、`fever_feed_mappings`、`fever_item_mappings`、`fever_sync_states` 投影到现有 `feeds` / `articles`。
- Fever 协议适配只放在 `src/server/integrations/fever/**`；route 和 worker 不直接拼 Fever 请求，也不直接解析 Fever DTO。
- Fever 同步、投影和写回编排放在 `src/server/domains/fever/services/**`；worker 仅通过 `fever.sync` 任务调度这些 service。
- Fever 账号配置还包含 `autoSyncEnabled`、`autoSyncIntervalMinutes`、`lastSyncAttemptAt`；字段持久化落在 `fever_accounts`，并通过 `/api/fever/accounts` 返回给前端。
- `fever.sync_due` 是每分钟运行一次的后台调度任务，只负责挑选到期账号并入队 `fever.sync`；真正的同步执行和远端读写仍统一走 `fever.sync`。
- 手动 `POST /api/fever/accounts/[id]/sync` 和后台 `fever.sync_due` 在成功入队后都要写入 `lastSyncAttemptAt`，避免长时间同步期间被重复调度。
- `PATCH /api/articles/[id]` 对 Fever article 必须先远端 `mark item`，成功后再提交本地 `is_read` / `is_starred`；本地 RSS article 保持直接本地更新。
- 阅读快照和 feed 列表必须过滤 `fever_item_mappings.is_active = false` 的 article，并返回 `provider`、`remoteManaged`、`remoteSource`，让前端能区分远端托管源。
