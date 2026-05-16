# 前端结构约束

## 页面与功能分层

- `src/app/**` 放页面入口、布局和 Route 级测试
- `src/features/**` 放按业务切分的界面与交互，例如 articles、feeds、settings、reader
- `src/components/ui/**` 放可复用 UI 基件，不直接承载业务语义
- `src/hooks/**` 放可复用客户端 hooks
- `src/store/**` 放跨组件共享的客户端状态

## 当前仓库的前端主轴

- 阅读器主界面从 `src/app/(reader)/ReaderApp.tsx` 进入
- 文章阅读体验主要集中在 `src/features/articles/**`
- 订阅源与 AI 解读配置集中在 `src/features/feeds/**`
- 设置中心集中在 `src/features/settings/**`
- 通知与提示集中在 `src/features/toast/**`、`src/features/notifications/**`

## 放置规则

- 新的业务组件优先放进对应 `src/features/<domain>/`
- 业务域内组件统一放在 `src/features/<domain>/components/`，避免组件与工具函数平铺混放
- 只有在多个业务域都复用时，才考虑放进 `src/components/ui/`
- 跨业务复用且不绑定特定业务语义的组件，统一放在 `src/components/**`
- 页面专属的小逻辑不要提前抽成全局 helper
- 需要共享给后端的类型或纯函数，不放在前端目录里
- 业务域私有工具统一放在 `src/features/<domain>/utils/`，避免与组件、hooks 平铺混放
- 组件域私有工具统一放在各自 `components` 旁的 `utils`，不要放回全局目录
- 业务私有 hooks 统一放在 `src/features/<domain>/hooks/`，由业务目录内组件就近引用
- 组件私有 hooks 统一放在 `src/components/ui/hooks/`，避免散落在 `ui` 根目录
- 跨业务复用的客户端 hooks 统一放在 `src/hooks/`，并通过 `index.ts` 聚合导出
- 跨业务复用且无业务语义的工具统一放在 `src/utils/`，仅在确实需要时提升到全局
