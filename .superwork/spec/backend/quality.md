# 后端质量门槛

## 测试要求

- 接口变更补对应 `route.test.ts` 或 `routes.test.ts`
- 服务逻辑变更补对应 `src/test/server/services/**/*.test.ts`
- 仓储逻辑变更补对应 `src/test/server/repositories/**/*.test.ts`
- Worker 逻辑变更补对应 `src/test/worker/**/*.test.ts`
- 迁移变更补对应 `src/test/server/db/migrations/*Migration.test.ts`

## 数据库要求

- 修改 SQL 前先确认是否需要新增迁移，而不是偷偷改现有语义
- migration 文件名沿用当前编号序列风格
- 涉及真实数据库的测试先确认 `DATABASE_URL`
- `src/test/server/repositories/repositories.integration.test.ts` 这类测试只在数据库环境齐备时执行

## 实现要求

- 相同业务规则不要同时散落在 `route.ts`、`service.ts`、`worker.ts`
- 错误映射优先复用 `src/server/infra/http/errors.ts`、`src/server/domains/**/tasks/**`
- 影响前端响应结构的改动，要同步考虑 `src/lib/api/apiClient.ts` 和前端消费点
