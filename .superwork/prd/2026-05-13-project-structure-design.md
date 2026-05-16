# FeedFuse 项目组织结构优化 Design

**Goal:** 在不改变任何业务行为的前提下，统一前后端目录职责与导入路径，提升可维护性与可读性。

**Suggested Spec Reads:**

- `.superwork/spec/guides/index.md` — 共享流程与通用检查清单
- `.superwork/spec/guides/repo-map.md` — 当前仓库目录职责与命令基线
- `.superwork/spec/guides/change-boundaries.md` — 前后端/共享边界约束
- `.superwork/spec/guides/verification.md` — 重构类任务验证策略
- `.superwork/spec/backend/structure.md` — 后端结构边界与分层职责
- `.superwork/spec/frontend/structure.md` — 前端按业务域组织规范
- `.superwork/spec/shared/structure.md` — 共享层最小稳定边界

**Context:**
当前仓库已具备 `app/api + server + features + shared` 的基础分层，但后端 `server` 内存在“按技术类型平铺”的结构（如 `services`、`repositories`、`tasks`），前端 `features` 与共享 `lib` 之间也有少量目录语义不一致点。近期已完成一次局部整理，本次需要在“只调整目录与导入路径”的约束下进一步统一。

**Recommended Approach:**
采用“分层 + 分域”重构：保留 `app/api`、`server`、`features` 的顶层边界；在 `server` 内引入 `infra` / `integrations` / `domains` 三段；在 `features` 与 `lib` 内统一目录语义与导出入口。全程不改业务逻辑、不改接口语义。

## 1. 目标结构

### 1.1 顶层保持不变
- `src/app/api/*`：HTTP 路由入口，仅保留 Route Handler 与路由私有 `_lib`
- `src/server/*`：后端实现
- `src/features/*`：前端业务域
- `src/components/ui/*`、`src/hooks/*`、`src/utils/*`、`src/lib/*`：跨域共享

### 1.2 后端改为“分层 + 分域”
- `src/server/infra/*`：基础设施（`db`、`http`、`logging`、`queue`、`env`）
- `src/server/integrations/*`：外部能力适配（`ai`、`rss`、`fulltext`、`media`、`opml`）
- `src/server/domains/<domain>/*`：业务域实现（`services`、`repositories`、`tasks`、`auth` 等）

### 1.3 前端保持业务域一致性
- `src/features/<domain>/{components,hooks,utils,types?}`
- 补齐 `src/features/<domain>/index.ts` 统一导出
- 域私有逻辑不再放入全局 `src/hooks` 或 `src/utils`

### 1.4 共享层语义统一
- `src/lib/api/*`：API 客户端与错误映射
- `src/lib/ui/*`：设计系统与展示辅助
- `src/lib/reader/*`：阅读流程共享逻辑
- `src/lib/feeds/*`：订阅源共享策略
- 保留 `src/lib/index.ts` 作为聚合出口（如当前项目需要）

## 2. 精确迁移清单

### 2.1 后端
- `src/server/db`、`src/server/http`、`src/server/logging`、`src/server/queue`、`src/server/env.ts` -> `src/server/infra/*`
- `src/server/ai`、`src/server/rss`、`src/server/fulltext`、`src/server/media`、`src/server/opml` -> `src/server/integrations/*`
- `src/server/repositories/*`、`src/server/services/*`、`src/server/tasks/*`、`src/server/auth/*` -> `src/server/domains/<domain>/*`

### 2.2 前端
- 保持 `src/features/<domain>/{components,hooks,utils}`
- `src/features/feeds/services/rssValidationService.ts` -> `src/features/feeds/utils/rssValidation.ts`
- 各业务域补 `index.ts`

### 2.3 测试
- `src/test/**` 继续镜像源码结构，随目录移动同步调整测试路径与导入

## 3. 迁移顺序

1. 迁移 `infra` 与 `integrations`，修复导入并通过类型检查。
2. 按业务域迁移 `domains`（`auth` -> `feeds` -> `articles` -> `settings/logs`）。
3. 整理前端 `features` 目录出口与 `lib` 分桶。
4. 同步迁移 `src/test` 镜像路径并修复导入。

## 4. 错误处理与风险控制

- 风险 1：路径批量替换引入漏改。  
  控制：分批迁移，每批执行路径扫描与类型检查。
- 风险 2：循环依赖被目录调整暴露。  
  控制：迁移后运行 lint 与测试，必要时补中间 `index.ts` 隔离。
- 风险 3：测试路径与别名失配。  
  控制：同步更新测试导入，按域执行测试回归。

## 5. 验证策略

每批迁移后执行：

1. `pnpm lint`
2. `pnpm type-check`
3. `pnpm test:unit`

最终完成标准：

- 路径别名错误为 0
- 新增循环依赖为 0
- 目录职责满足“分层 + 分域”规则
- 业务行为与 API 语义保持不变
