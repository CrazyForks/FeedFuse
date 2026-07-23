# 跨层变更检查

FeedFuse 的典型链路是 `UI -> apiClient -> route -> service -> repository/queue -> worker`。跨层改动必须保持数据与错误语义一致。

## 检查项

- 跟踪字段从 `src/types/**`、请求 DTO 到响应 DTO 和前端消费点的完整路径
- 在 route 边界校验输入，在 service 表达业务规则，在 repository 保证持久化约束
- 异步任务检查 payload、singleton key、任务状态、日志和用户作用域是否一致
- 多用户数据必须在 route、service、repository、queue、worker 全链路携带 `userId`
- 更新接口字段时同步检查 `src/lib/api/apiClient.ts`、store、feature 和镜像测试
- 明确成功、失败、重试、取消和回退行为，不让各层自行推导
