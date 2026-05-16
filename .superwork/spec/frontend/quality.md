# 前端质量门槛

## 测试要求

- 新增或修正交互时，优先在 `src/test` 镜像目录补 `*.test.tsx` 或 `*.spec.tsx`
- 已有模式优先复用，例如 `ReaderLayout.test.tsx`、`ArticleView.*.test.tsx`、`SettingsCenterModal.test.tsx`
- 涉及异步 UI、流式摘要、沉浸式翻译时，至少覆盖成功态和关键失败态

## 实现要求

- 状态归属要清晰：局部状态留在 feature 内，共享状态再进 `src/store`
- 前端错误提示优先复用现有通知链路，不新增散落的 `alert`
- 与接口交互时优先复用 `src/lib/api/apiClient.ts`，不要在组件里复制 fetch 细节
- 样式修改优先复用现有 token、class 约定和 UI 组件

## 回归要求

- 大改文章阅读、订阅列表、设置中心后，至少跑一次 `pnpm test:unit`
- 大改全局布局、主题或入口页面后，补跑 `pnpm build`
