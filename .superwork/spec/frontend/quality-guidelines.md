# 前端质量指南

## 验证基线

- 小范围交互先运行对应 `src/test/**/*.test.tsx`
- 跨 feature、store 或请求链路的变更运行 `pnpm test:unit`
- 所有代码变更运行 `pnpm lint` 与 `pnpm type-check`
- 页面入口、全局样式、Next.js 构建行为变化时运行 `pnpm build`

## 回归重点

- 异步 UI 覆盖成功、失败、取消或重试中的关键路径
- 响应式布局检查桌面与窄屏，不允许文本溢出、控件重叠或动态内容引起布局跳动
- 键盘交互、焦点管理、可访问名称和浮层关闭行为必须可测试
- 主题与共享样式变化补跑 `theme-token-usage`、popup surface 或相关组件契约测试

测试命令选择见 [验证策略](../guides/verification.md)。
