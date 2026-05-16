# 前端交互与接口契约

## API 消费

- 前端请求优先经过 `src/lib/api/apiClient.ts`
- 新接口如果需要被多个 feature 复用，应先补客户端封装，再落到组件
- 接口错误文案与通知优先复用 `src/lib/api/apiErrorNotifier.ts`、`src/lib/api/mapApiErrorToUserMessage.ts`

## 状态与交互

- 阅读器级交互先看 `src/app/(reader)/ReaderApp.tsx` 与 `src/features/reader/**`
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
