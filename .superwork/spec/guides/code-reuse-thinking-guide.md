# 代码复用检查

新增 helper、hook、组件或服务前，先确认仓库是否已有稳定实现，避免相同规则分散维护。

## 检查项

- 前端请求、错误映射和轮询优先复用 `src/lib/api/**`
- 设计 token 与共享样式优先复用 `src/lib/ui/designSystem.ts` 和 `src/components/ui/**`
- 业务规则优先复用 `src/server/domains/**/services/**`，数据库操作复用对应 repository
- RSS、AI、Fever、全文和媒体能力优先复用 `src/server/integrations/**`
- 只有出现多个真实消费方时，才把 feature 私有实现提升到 `src/lib/**`、`src/hooks/**` 或 `src/utils/**`
- 抽象形成长期边界后，更新对应层的结构或契约文档
