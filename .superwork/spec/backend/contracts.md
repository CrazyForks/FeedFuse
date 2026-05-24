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
- `feed.fetch` / `feed.refresh_all` 这条本地 RSS 抓取链路只允许处理 `feeds.kind = 'rss' and feeds.provider = 'local_rss'`；Fever 投影源绝不能进入本地 RSS XML 抓取队列。
- Fever 协议适配只放在 `src/server/integrations/fever/**`；route 和 worker 不直接拼 Fever 请求，也不直接解析 Fever DTO。
- Fever 同步、投影和写回编排放在 `src/server/domains/fever/services/**`；worker 仅通过 `fever.sync` 任务调度这些 service。
- Fever 账号配置还包含 `autoSyncEnabled`、`autoSyncIntervalMinutes`、`lastSyncAttemptAt`；字段持久化落在 `fever_accounts`，并通过 `/api/fever/accounts` 返回给前端。
- `/api/fever/accounts` 的创建与更新契约还包含 `enabled`；账号级自动同步状态由 `autoSyncIntervalMinutes` 推导，间隔大于 `0` 时返回 `autoSyncEnabled = true`，间隔等于 `0` 时返回 `autoSyncEnabled = false`，避免前后端各自维护两套开关语义。
- 删除 Fever account 时，必须同时删除该账号投影出来的本地 `provider = 'fever'` feeds，并清理因此变空的分类；只删除 mapping 或 account 本身而保留本地 feed 会导致左栏快照残留失效来源。
- `fever.sync_due` 是每分钟运行一次的后台调度任务，只负责挑选到期账号并入队 `fever.sync`；真正的同步执行和远端读写仍统一走 `fever.sync`。
- `fever.sync` 的队列去重键必须始终绑定 `accountId`；`runId` 只用于 `feed_refresh_runs` 跟踪，不能让不同 run 绕过账号级互斥。
- 手动 `POST /api/fever/accounts/[id]/sync` 和后台 `fever.sync_due` 在成功入队后都要写入 `lastSyncAttemptAt`，避免长时间同步期间被重复调度。
- 用户触发 `POST /api/feeds/refresh` 时，内部派发到 `fever.sync` 的账号也必须在成功入队后写入 `lastSyncAttemptAt`；不能让手动全量刷新绕过调度去重基线。
- `enqueueFeverRefreshAllTargets` 这类批量入口也必须在确认 `fever.sync` 真正入队后再写 `lastSyncAttemptAt`；重复任务或入队失败不能推迟下一次自动调度。
- 手动 `POST /api/fever/accounts/[id]/sync` 还必须先校验账号存在且处于启用状态；不存在或已停用账号不能返回“已入队”成功态。
- `POST /api/feeds/[id]/refresh` 在分流到 `fever.sync` 前，也必须校验关联 Fever account 仍然启用；停用账号不能通过 feed 级入口绕过账号状态约束。
- 用户触发 `POST /api/feeds/[id]/refresh` 或 `POST /api/feeds/refresh` 时，如果目标包含 `provider = 'fever'` 的 feed，必须分流到对应账号的 `fever.sync`，并把该账号关联的本地 feed item 一并纳入 `feed_refresh_runs` 跟踪；Fever feed 不支持 feed 级 scoped sync，单点入口也只能触发账号级同步。
- `fever_accounts` 通过 `(base_url, username)` 唯一标识一个 Fever 服务账号；重复配置必须返回冲突错误，而不是创建第二条同身份记录。
- `fever_feed_mappings.local_feed_id` 必须保持唯一；一个本地 `provider = 'fever'` 投影 feed 只能属于一个 Fever 账号，删除账号时直接删除该账号投影出的本地 feed。
- `PATCH /api/articles/[id]` 对 Fever article 必须先远端 `mark item`，成功后再提交本地 `is_read` / `is_starred`；本地 RSS article 保持直接本地更新。
- 阅读快照和 feed 列表必须过滤 `fever_item_mappings.is_active = false` 的 article，并返回 `provider`、`remoteManaged`、`remoteSource`，让前端能区分远端托管源。
- 阅读快照还必须同时过滤关联 `fever_feed_mappings.is_active = false` 的 article；不能出现左栏源已消失但聚合视图和未读计数仍保留旧文章。
- 阅读快照的文章列表、`totalCount` 和左栏 `unreadCount` 必须使用同一套 Fever active 过滤条件；不能只在列表查询里隐藏失效 article，否则会出现“列表为空但计数仍大于 0”的漂移。
- `listFeeds` 必须隐藏没有任何 `fever_feed_mappings.is_active = true` 记录的 `provider = 'fever'` 本地投影 feed，避免上游删除后左栏残留孤儿来源。
- `listFeeds` 还必须隐藏只关联到 `enabled = false` Fever account 的 `provider = 'fever'` 投影 feed；停用账号后左栏不能继续暴露其 RSS 来源。
- Fever feed 已存在本地投影时，同步仍必须回写远端 `title`、`url`、分类和 `siteUrl/iconUrl` 变化；Fever 是权威源，不能只更新 mapping 快照而不更新本地 feed DTO。
- 在没有可靠全量校正语义前，`fever.sync` 不能根据单次 `items` 响应把未返回的 Fever item 直接标记为 inactive；单次响应可能只是分页或窗口结果。
- Fever 同步必须显式区分增量模式与全量校正模式；只有全量校正才能根据返回的 `items` 集合失活缺失 item，并写回 `last_full_sync_at`。
- Fever article 的写回查询必须同时过滤 `fever_item_mappings.is_active = true`、`fever_feed_mappings.is_active = true` 和 `fever_accounts.enabled = true`；已停用或已失效的来源不能继续参与远端写回。
- `POST /api/fever/accounts` 与 `PATCH /api/fever/accounts` 在写入连接配置前必须先验证 Fever 服务可连通且凭据有效，不能把错误配置保存成成功状态。
