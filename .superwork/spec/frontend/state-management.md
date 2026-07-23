# 前端状态管理

## 状态归属

- 短生命周期 UI 状态留在组件或 feature Hook
- 跨组件阅读器状态使用 `src/store/appStore.ts`，设置与认证分别使用 `settingsStore.ts`、`authStore.ts`
- 服务端数据通过 `src/lib/api/apiClient.ts` 读取，写入成功后以服务端响应校正本地状态
- 轮询与流式任务必须区分 pending、running、completed、failed 与 cancelled

## 用户隔离

- 用户级 localStorage key 必须包含 `userId`，不能让后登录用户继承前一用户状态
- 获取当前用户后重新加载对应命名空间的设置与阅读器状态
- 登出时清理内存中的用户状态；持久化状态只按当前用户命名空间读取
- 具体 key 和兼容语义以 [长期交互契约](./contracts.md) 为准
