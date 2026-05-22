# Fever Service Integration Design

**Goal:** 在 FeedFuse 中接入 Fever 作为第二类 RSS 来源，同时复用现有本地阅读、全文、摘要、翻译和智能解读链路。

**Suggested Spec Reads:**

- `.superwork/spec/guides/index.md` — 共享工作流规则与跨层检查项
- `.superwork/spec/guides/change-boundaries.md` — 约束 route、service、repository、worker 的职责边界
- `.superwork/spec/backend/index.md` — 后端目录范围与验证要求
- `.superwork/spec/backend/contracts.md` — route、service、repository、worker、迁移契约
- `.superwork/spec/frontend/index.md` — 前端 reader/feed/settings 变更范围
- `.superwork/spec/frontend/contracts.md` — feed 与 article 前端消费契约
- `.superwork/spec/guides/verification.md` — 计划与实现阶段的默认验证基线

**Context:**
当前 FeedFuse 已有成熟的本地 RSS 数据模型与处理链路：`feeds`、`articles`、`readerSnapshotService`、`feed.fetch` worker、全文抓取、AI 摘要、正文翻译和智能报告都围绕本地持久化模型工作。用户希望新增一套基于 Fever 服务端提供的 RSS 来源，并要求这部分来源在阅读、摘要、翻译、智能解读与展示层面与本地 RSS 基本一致。同时，Fever 来源需支持已读/收藏双向回写，并以 Fever 上游为最终权威，当上游 feed 或 item 消失时，本地增强结果也应随之失效。

**Recommended Approach:**
采用“上游 Fever 为准的本地投影缓存”方案。FeedFuse 不直接让前端消费 Fever API，也不把 Fever 做成完全独立的第二套阅读域模型，而是在本地数据库中维护 Fever account、feed 映射和 item 映射，把 Fever feed/item 投影到现有 `feeds` / `articles` 执行模型里。阅读器与 AI 链路继续复用当前实现；Fever 双向状态写回通过专门的 service/integration 适配层处理。

## 外部协议边界

Fever 协议适合被视作“上游阅读源”，不适合作为应用的主业务模型：

- 协议通常提供 `feeds`、`groups`、`items`、`favicons`、`unread_item_ids`、`saved_item_ids` 与 `mark` 类写接口。
- 常见实现支持通过 `mark=item` / `mark=feed` 形式回写已读、未读、收藏、取消收藏。
- 常见实现通常不通过 Fever 协议开放完整的 feed 创建、编辑、删除能力，因此 FeedFuse 不能把 Fever feed 当成本地可完全编辑对象。
- 不同 Fever 兼容实现对分页、增量同步和部分扩展能力存在差异，需要在客户端兼容 `since_id` / `max_id` / 全量校正的混合策略。

本设计基于以下已验证资料：

- Miniflux Fever API 文档：`https://miniflux.app/docs/fever.html`
- FreshRSS Fever API 文档：`https://freshrss.github.io/FreshRSS/en/developers/06_Fever_API.html`
- The Arsse Fever 兼容说明：`https://thearsse.com/manual/en/Supported_Protocols/Fever.html`
- Miniflux 2.2.0 发布说明中对 Fever 支持的介绍：`https://miniflux.app/releases/2.2.0.html`

## 决策摘要

### 已确认产品约束

- 接入模式：实时代理语义，但不让前端直接调用 Fever，而是通过本地投影层对外呈现。
- 写回策略：已读、收藏、稍后读语义采用双向写回；本地交互必须回推 Fever。
- 权威源：Fever 为准；上游删除或不再返回的 feed/item 在本地应失效并从阅读面隐藏。
- 复用目标：摘要、翻译、智能解读、全文抓取与展示形式尽量复用当前本地 RSS 链路。

### 方案比较

1. 纯实时代理：前端与 API 层直接面向 Fever DTO，所有阅读与 AI 功能额外加 Fever 分支。改动面最广，不推荐。
2. 上游为准的本地投影缓存：保留本地执行模型，用 Fever 适配层同步并回写。复用度最高，推荐。
3. 完全镜像导入：把 Fever 当导入器，本地自管后续状态。与“Fever 为准 + 双向写”冲突，不采用。

## 目标架构

### 总体分层

- `src/server/integrations/fever/**`
  负责 Fever HTTP 客户端、认证、请求/响应解析、协议兼容与错误映射。
- `src/server/domains/fever/**`
  负责 account、mapping、sync 状态和双向写回的业务编排。
- `src/server/domains/feeds/**` 与 `src/server/domains/articles/**`
  继续作为阅读器主执行模型，承载阅读视图和 AI 增强。
- `src/worker/**`
  新增 Fever 同步任务，负责从上游拉取 feed/item 变化并把结果投影到本地。
- `src/features/**` 与 `src/lib/api/apiClient.ts`
  只消费统一后的 feed/article DTO，不直接识别 Fever 协议细节，只在 UI 能力边界上体现“远端托管订阅”限制。

### 数据模型

保留现有 `feeds` / `articles` 作为阅读执行模型，同时补充来源和映射层。

#### 对现有表的调整

- `feeds`
  - 新增 `provider` 字段：`local_rss | fever`
  - 保留已有自动化开关字段与阅读展示配置
  - Fever feed 的 `title/url/siteUrl/iconUrl/categoryId` 由同步投影维护，不由常规编辑表单直接改写
- `articles`
  - 尽量复用现有列，不额外拆 Fever 专用文章表
  - `is_read` / `is_starred` 仍作为阅读器即时状态字段，但 Fever 来源的权威状态来自映射同步与写回结果

#### 新增表

- `fever_accounts`
  - 保存服务地址、用户名、api password 或其 hash、启用状态、最后探测结果、最近同步时间、错误信息
- `fever_feed_mappings`
  - 绑定 `fever_account_id + fever_feed_id + local_feed_id`
  - 保存远端分组信息、远端 favicon 元数据、远端 title/url 快照、`is_active`
- `fever_item_mappings`
  - 绑定 `fever_account_id + fever_item_id + local_article_id + local_feed_id`
  - 保存远端 `is_read`、`is_saved`、远端 `created_on_time`、`last_seen_at`、`is_active`
- `fever_sync_states`
  - 保存账号级同步游标、最近全量校正时间、最近增量同步时间、最近错误

### 统一 DTO

前后端继续使用统一 feed/article DTO，不引入 Fever 专用前端 DTO 分支，但要新增少量来源字段：

- `Feed.provider`
- `Feed.remoteSource`
  - 可选，值如 `fever`
- `Feed.remoteManaged`
  - 布尔值，用于前端判断哪些字段只读
- `Article.remoteSource`
  - 可选，值如 `fever`

目标是让 `ReaderSnapshotFeed`、`Feed`、`Article` 在保持现有消费模式的前提下，具备最小可辨识的来源信息。

## 同步设计

### 首次接入流程

1. 用户在设置页新增 Fever account，而不是手工新增单个 Fever feed。
2. 后端校验 account 凭据与服务连通性：
   - `api`
   - `feeds`
   - `groups`
   - `favicons`
   - `items`
3. 首次同步拉全量 feed/group/favicon，并在本地创建：
   - `categories` 投影
   - `feeds` 投影
   - `fever_feed_mappings`
4. 按批次拉取 item 并落地为本地 `articles`，同时建立 `fever_item_mappings`。
5. 新文章创建后直接复用当前文章自动化链路，进入过滤、全文、摘要、翻译和智能解读流程。

### 增量同步流程

新增独立 `fever.sync` worker，而不是复用 RSS XML 抓取 worker。

同步分两类：

- 高频增量同步
  - 依据 Fever 支持的 item 增量参数拉取新 item 与状态变化
  - 更新本地 `feeds/articles/mappings`
- 低频全量校正
  - 周期性全量比对远端 feed/group/favicon 与 item 存在性
  - 修正标题、分组、图标、已读、收藏漂移
  - 识别上游已删除对象

### 上游删除与失效策略

用户已经确认“Fever 为准”，因此采用严格失效策略：

- 若某个 Fever feed 在校正同步中确认消失：
  - `fever_feed_mappings.is_active = false`
  - 对应 `feeds` 不再出现在阅读器快照
- 若某个 Fever item 在校正同步中确认消失：
  - `fever_item_mappings.is_active = false`
  - 对应 `articles` 不再出现在阅读器快照
- 本地全文、摘要、翻译、智能解读等增强结果不再对外可见

这里不做“孤儿增强缓存继续展示”，避免破坏上游权威边界。

## 写回设计

### 单篇文章已读/收藏

当前 `PATCH /api/articles/[id]` 直接更新本地 `articles`。接入 Fever 后应改为 service 编排：

1. route 只解析请求参数。
2. service 先判断 article 是否存在 Fever mapping。
3. 若是本地 RSS article：
   - 保持现有 `setArticleRead` / `setArticleStarred` 逻辑。
4. 若是 Fever article：
   - 调用 Fever `mark` 接口回写远端状态。
   - 远端成功后再提交本地 `articles` 状态更新。
   - 远端失败则本地不提交最终状态，直接返回错误。

### 批量标记已读

`/api/articles/mark-all-read` 也必须纳入相同服务编排：

- 先根据当前 view/feed 找出命中的 article 集合。
- 将本地 RSS article 与 Fever article 拆分处理。
- Fever article 先聚合为远端批量标记请求。
- 只有远端写回成功后，才提交本地已读状态。

### 冲突规则

第一期不做离线写回队列，也不做复杂 CRDT。冲突规则保持简单且可解释：

- 本地主动操作：
  - 远端成功，才写本地。
- 后台同步拉到远端新状态：
  - 直接覆盖本地 `is_read` / `is_starred`。
- 本地操作失败：
  - 保持旧值，不制造“待同步脏状态”。

这与“Fever 为准”一致，也能显著降低实现复杂度。

## UI 与交互设计

### 订阅源呈现

Fever feed 在左栏与阅读器里与本地 RSS 并列出现，但需要来源标记：

- 在 `FeedList` / 设置界面展示 `Fever` badge 或等价只读标识
- 在编辑弹窗中，把远端托管字段改为只读说明

### Fever feed 可编辑项

允许保留本地增强配置：

- `enabled`
- `fullTextOnOpenEnabled`
- `fullTextOnFetchEnabled`
- `aiSummaryOnOpenEnabled`
- `aiSummaryOnFetchEnabled`
- `bodyTranslateOnFetchEnabled`
- `bodyTranslateOnOpenEnabled`
- `titleTranslateEnabled`
- `bodyTranslateEnabled`
- `articleListDisplayMode`

### Fever feed 禁止编辑项

以下字段由上游拥有，前端只展示不允许本地修改：

- `title`
- `url`
- `siteUrl`
- `category/group` 权威归属
- 删除远端 feed

### 设置中心

新增 Fever account 管理入口：

- 新增 account
- 测试连接
- 立即同步
- 暂停/启用 account
- 查看最近同步错误

不在第一期支持通过 FeedFuse 修改 Fever 服务端 feed 结构。

## 对现有代码的影响范围

### 后端

- `src/app/api/feeds/**`
  - feed DTO 返回来源字段
  - Fever feed 编辑能力受限
- `src/app/api/articles/[id]/route.ts`
  - 已读/收藏更新改走 service 编排
- `src/app/api/articles/mark-all-read/route.ts`
  - 批量标记已读改走 service 编排
- `src/server/domains/reader/services/readerSnapshotService.ts`
  - 过滤失效 Fever feed/item
  - 返回来源字段与远端托管标识
- `src/server/domains/feeds/**`
  - 扩展 feed provider 支持
- `src/server/domains/fever/**`
  - 新建 Fever account、mapping、sync、writeback 服务
- `src/server/integrations/fever/**`
  - 新建 Fever API 客户端与协议适配
- `src/server/infra/db/migrations/**`
  - 新增 provider/account/mapping/sync_state 相关迁移
- `src/worker/**`
  - 新增 `fever.sync` 任务及调度

### 前端

- `src/types/index.ts`
  - 增加 feed/article 来源字段
- `src/lib/api/apiClient.ts`
  - 适配新增 DTO 字段
- `src/features/feeds/components/FeedList.tsx`
  - Fever 来源标记与右键菜单限制
- `src/features/feeds/components/EditFeedDialog.tsx`
  - Fever feed 只读字段展示
- `src/features/settings/**`
  - Fever account 设置与同步入口

## 错误处理

需要单独定义 Fever 适配层错误映射，至少覆盖：

- 认证失败
- 服务不可达
- 返回格式不兼容
- 标记写回失败
- 同步游标失效或增量拉取失败

这些错误应在 integration 层归一化，再由 service 决定：

- 返回给 route 的用户错误
- 记录到同步状态
- 是否触发重试或降级为全量校正

## 验证策略

按现有仓库规则，至少覆盖以下层级：

- migration 测试
- repository 测试
- Fever 同步 service 测试
- article 已读/收藏写回 service 测试
- `route.test.ts` API 测试
- worker 测试
- 前端 feed 编辑限制与来源标记测试

最低回归基线：

- `pnpm lint`
- `pnpm type-check`
- 相关 `src/test/app/api/**`
- 相关 `src/test/server/**`
- 相关 `src/test/worker/**`
- 相关 `src/test/features/**`

若改动跨层行为较多，补跑：

- `pnpm test:unit`
- 必要时 `pnpm build`

## 分阶段建议

建议分三阶段落地，避免一次性跨层 diff 过大：

1. 数据与同步基础设施
   - migration、Fever client、account/mapping/sync service、初始同步
2. 阅读与回写打通
   - reader snapshot、article 写回、mark-all-read、worker 调度
3. 前端接入与交互收口
   - 设置页、feed 列表来源标记、编辑限制、错误展示

## 非目标

第一期明确不做：

- 通过 FeedFuse 创建、编辑、删除远端 Fever feed
- 本地离线待同步队列
- 多 Fever account 聚合冲突解决策略优化
- 跨设备本地增强结果长期保留
