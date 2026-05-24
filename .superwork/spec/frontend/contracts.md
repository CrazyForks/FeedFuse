# 前端交互与接口契约

## API 消费

- 前端请求优先经过 `src/lib/api/apiClient.ts`
- 新接口如果需要被多个 feature 复用，应先补客户端封装，再落到组件
- 接口错误文案与通知优先复用 `src/lib/api/apiErrorNotifier.ts`、`src/lib/api/mapApiErrorToUserMessage.ts`

## 状态与交互

- 阅读器级交互先看 `src/app/(reader)/ReaderApp.tsx` 与 `src/features/reader/**`
- 全局 reader 快捷键归 `src/features/reader/components/ReaderLayout.tsx` 管理；快捷键必须忽略输入框、`contenteditable`、`select` 和已打开的非快捷键弹窗，文章内动作可通过显式 reader command 交给 `ArticleView` 执行。
- 新增或调整 reader 快捷键时，同步更新快捷键帮助弹窗，并在 `src/test/features/reader/ReaderLayout.test.tsx` 覆盖至少一个正向触发和一个弹窗/输入焦点保护场景。
- 文章视图相关契约先看 `src/features/articles/components/ArticleView.tsx`、`src/features/articles/hooks/useStreamingAiSummary.ts`、`src/features/articles/hooks/useImmersiveTranslation.ts`
- 设置保存逻辑先看 `src/features/settings/hooks/useSettingsAutosave.ts`
- AI 设置中的 `summaryPrompt`、`translationPrompt` 由设置中心维护；前端只负责编辑与保存，不在组件层拼接任务级 system prompt
- 中栏文章列表的已读/未读按钮按当前选中 `view` 记忆用户选择；该选择优先于全局 `defaultUnreadOnlyInAll`，刷新页面和切换订阅源后仍应保留。

## 与后端联动

- 如果前端需要新字段，先确认 `src/app/api/**` 返回结构和 `src/types/**` / `src/lib/**` 是否同步
- 如果 UI 依赖新异步状态，先确认 `src/worker/**` 与 `src/server/domains/**/services/**` 是否已经稳定提供该状态

## 订阅源自动化交互契约

- 订阅源右键菜单仍是全文抓取、AI 摘要和翻译策略的入口，具体弹窗在 `src/features/feeds/components/FeedFulltextPolicyDialog.tsx`、`FeedSummaryPolicyDialog.tsx`、`FeedTranslationPolicyDialog.tsx`。
- 策略保存通过 `src/features/feeds/components/FeedList.tsx` 调用 store 的 `updateFeed`，最终走 `src/lib/api/apiClient.ts` 的 feed 更新封装。
- 文章打开后的全文、摘要、翻译按钮状态由 `src/features/articles/components/ArticleView.tsx` 结合 `getArticleTasks` 轮询结果控制。
- `fullTextOnOpenEnabled` 只影响打开文章时的全文等待与按钮可用性；AI 摘要和翻译仍通过各自 enqueue 接口进入 worker。
- `Feed.kind === 'ai_digest'` 的文章不触发全文抓取和翻译操作，避免对智能报告二次处理。
- 带 `mediaAttachments` 的播客文章在 `ArticleView` 中渲染原生音视频播放器，并隐藏全文抓取、AI 摘要和翻译入口；自动打开触发也必须跳过。
- `Feed.isPodcast` 由后端 snapshot 从 `article_media_attachments` 推导；播客 RSS 源在左栏右键菜单中不显示全文抓取、AI 摘要和翻译配置项。

## Fever 来源交互契约

- 前端统一通过 `src/lib/api/apiClient.ts` 消费 Fever 账号接口，不直接在组件里拼 `/api/fever/**` 请求。
- `Feed.provider === 'fever'` 时，UI 必须把该 feed 视为远端托管源：展示 `Fever` 来源标记，并通过 `remoteManaged` / `remoteSource` 驱动只读或受限交互。
- Fever feed 仍出现在阅读器左栏和快照里，但编辑弹窗中的标题、URL 等上游托管字段必须只读，避免把本地表单当成上游配置入口。
- 设置中心为 Fever account 提供独立分区入口；新增账号和手动同步通过该分区完成，不在普通添加 RSS 源对话框中混入 Fever feed 创建，也不与密码/登录安全操作混放。
- Fever account 分区还必须提供自动同步配置入口，并通过 `src/lib/api/apiClient.ts` 的 `/api/fever/accounts` PATCH 保存 `autoSyncEnabled` 与 `autoSyncIntervalMinutes`。
- Fever account 的新增和编辑共用同一个弹窗表单，避免新增/编辑表单规则分叉；卡片右上角还必须提供服务级启用开关，支持不进弹窗快速启用/停用账号。
- Fever account 分区通过 `src/lib/api/apiClient.ts` 的 `/api/fever/accounts` 保存 `enabled` 与 `autoSyncIntervalMinutes`；当同步间隔大于 `0` 时自动启用自动同步，等于 `0` 时视为关闭自动同步，不再单独暴露自动同步开关字段给表单。
- 自动同步配置使用显式保存动作而不是隐式表单提交；保存成功后前端必须回显后端返回的账号配置，避免本地草稿与真实调度状态漂移。
- Fever 账号分区必须暴露删除账号配置入口；同步失败后需要显示后端返回的账号级错误结果，避免用户只看到开始态而没有终态反馈。
