# 前端组件规范

## 组件边界

- 业务组件放在 `src/features/<domain>/components/**`，只负责一个清晰的界面职责
- 通用 UI 基件复用 `src/components/ui/**` 与 Radix 组件，不在 feature 内复制弹窗、按钮、输入框等基础实现
- 组件通过显式 props 与回调表达依赖；跨页面共享状态才进入 `src/store/**`
- 数据请求优先封装在 Hook、store 或 `src/lib/api/apiClient.ts`，避免在展示组件内散落 `fetch`

## 交互要求

- 交互组件必须覆盖禁用、加载、错误和空数据状态
- 弹窗、Popover、Sheet 等浮层复用现有 motion 与 surface 约定
- 图标按钮提供可访问名称或 Tooltip，表单控件保持 Label 关联
- 新增稳定组件模式时，同步更新 `src/test/components/ui/**` 或对应 feature 测试
