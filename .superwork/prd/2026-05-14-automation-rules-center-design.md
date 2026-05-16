# 自动化规则中心 Design

**Goal:** 将分散在设置中心与 Feed 配置中的自动化开关统一为“规则中心”，以统一模型在入库与打开两条链路执行自动化行为。

**Suggested Spec Reads:**

- `.superwork/spec/guides/index.md` — 共享流程与任务入口规则
- `.superwork/spec/guides/repo-map.md` — 仓库目录职责与改动落点
- `.superwork/spec/guides/change-boundaries.md` — 前端/API/服务/仓储边界约束
- `.superwork/spec/guides/verification.md` — 本任务对应验证范围与命令基线
- `.superwork/spec/frontend/index.md` — 前端层范围与设置中心入口约束
- `.superwork/spec/frontend/contracts.md` — 设置保存与 API 消费契约
- `.superwork/spec/frontend/structure.md` — 新增规则中心前端模块的放置规则
- `.superwork/spec/frontend/quality.md` — 交互改动测试与回归要求
- `.superwork/spec/backend/index.md` — 后端层范围与 route/service/repository 分工
- `.superwork/spec/backend/contracts.md` — route 到 service、service 到 repository 契约
- `.superwork/spec/backend/structure.md` — 规则引擎与执行链路在后端的职责落位
- `.superwork/spec/backend/quality.md` — 迁移、服务与接口测试要求
- `.superwork/spec/shared/index.md` — 共享模块提升边界
- `.superwork/spec/shared/structure.md` — 共享类型/工具是否入 shared 的判断规则

**Context:**
当前自动化配置分散在三处：
- `src/features/settings/panels/GeneralSettingsPanel.tsx`（自动标记已读、默认仅未读）
- `src/features/settings/panels/RssSettingsPanel.tsx`（关键词过滤、AI 过滤）
- `src/features/feeds/components/*PolicyDialog.tsx`（全文/摘要/翻译触发开关）

配置写入路径也分散：`ui_settings`（全局设置）与 `feeds` 表字段（Feed 级触发）。执行点分别位于入库/打开流程，缺少统一规则模型、统一优先级和统一冲突策略。

**Recommended Approach:**
采用独立规则域（方案 B）：新增规则数据模型与 RuleEngine，把自动化行为统一建模为规则，按 `priority`（数值越小越优先）在 `on_fetch` 与 `on_open` 两条链路执行；设置中心新增“规则中心”作为唯一自动化配置入口，并提供旧配置到新规则的一次性迁移。

## 1. 范围与目标

### 1.1 本次范围（V1）
- 新增统一规则中心，覆盖自动化动作：`mark_read`、`filter`、`ai_summary`、`ai_translate`、`fulltext_fetch`
- 规则维度支持：
  - 作用范围：`global` / `category` / `feed`
  - 触发时机：`on_fetch` / `on_open`
  - 内容条件：关键词、来源语言
  - 时间条件：时间窗口（按本地时区）
- 冲突策略：同一动作类型按 `priority` 升序，第一条命中即生效

### 1.2 非目标（V1 不做）
- 拖拽排序
- 跨规则组合表达式（AND/OR 嵌套组）
- 规则版本历史回溯与审计 UI
- 多租户/多用户级规则隔离（当前仓库为单实例设置）

## 2. 架构与职责边界

### 2.1 后端
- 新增 `src/server/domains/automation-rules/**`
  - `repositories/automationRulesRepo.ts`：规则读写
  - `services/ruleEngineService.ts`：规则匹配与动作决议
  - `services/ruleMigrationService.ts`：旧配置迁移为规则
  - `services/ruleValidationService.ts`：规则字段校验与归一化
- `src/app/api/automation-rules/**`：仅处理请求校验、调用 service、返回 DTO

### 2.2 前端
- 新增 `src/features/automation-rules/**`
  - 规则列表、编辑器、优先级与启停控制
- `src/features/settings/components/SettingsCenterDrawer.tsx` 新增 `rules` 分区
- 现有 `general/rss/feed policy` 自动化开关改为只读提示或迁移后隐藏

### 2.3 共享层
- 共享类型放 `src/types` 或规则域内专用类型文件
- 仅当前后端都需要时再提升到 `src/lib/**`

## 3. 数据模型设计

### 3.1 表结构
1. `automation_rules`
- `id` bigint PK
- `name` text not null
- `enabled` boolean not null default true
- `priority` int not null
- `scope_type` text not null check in (`global`,`category`,`feed`)
- `scope_ref_id` bigint null
- `trigger_phase` text not null check in (`on_fetch`,`on_open`)
- `conditions` jsonb not null default `'{}'::jsonb`
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

2. `automation_rule_actions`
- `id` bigint PK
- `rule_id` bigint not null references `automation_rules(id)` on delete cascade
- `action_type` text not null check in (`mark_read`,`filter`,`ai_summary`,`ai_translate`,`fulltext_fetch`)
- `action_config` jsonb not null default `'{}'::jsonb`
- `created_at` timestamptz not null default now()

### 3.2 唯一性与索引
- 唯一约束：`(rule_id, action_type)`，确保同一规则内动作类型不重复
- 查询索引：
  - `idx_automation_rules_phase_enabled_priority` on `(trigger_phase, enabled, priority)`
  - `idx_automation_rules_scope` on `(scope_type, scope_ref_id)`

### 3.3 条件 JSON 约定（V1）
```json
{
  "keyword": {
    "enabled": true,
    "mode": "any",
    "values": ["招聘", "广告"]
  },
  "sourceLanguage": {
    "enabled": true,
    "values": ["en", "ja"]
  },
  "timeWindow": {
    "enabled": true,
    "timezone": "Asia/Shanghai",
    "daysOfWeek": [1,2,3,4,5],
    "start": "09:00",
    "end": "18:00"
  }
}
```

## 4. 规则执行与数据流

### 4.1 输入上下文
- `phase`: `on_fetch | on_open`
- `article`: 标题、摘要、正文、来源语言、发布时间等
- `feed/category`: feedId、categoryId
- `now`: 当前时间（用于时间窗口匹配）

### 4.2 匹配流程
1. 查询 `enabled=true` 且 `trigger_phase=phase` 的候选规则
2. 按 scope 命中（global/category/feed）过滤
3. 按 `priority ASC` 排序
4. 逐条校验条件（关键词、来源语言、时间窗口）
5. 对每个 `action_type`，记录第一条命中规则作为最终决议

### 4.3 执行动作
- `filter`：复用现有过滤结果写入逻辑
- `mark_read`：复用现有已读标记逻辑
- `ai_summary`：复用摘要队列触发逻辑
- `ai_translate`：复用翻译队列触发逻辑
- `fulltext_fetch`：复用全文抓取触发逻辑

RuleEngine 只做“决议”，不直接写 SQL 或发送 HTTP。

## 5. 旧配置迁移策略

### 5.1 迁移来源
- `ui_settings.general.autoMarkReadEnabled/autoMarkReadDelayMs`
- `ui_settings.rss.articleFilter.keyword`
- `ui_settings.rss.articleFilter.ai`
- `feeds` 表的 `*OnFetch/*OnOpen`、翻译/全文开关

### 5.2 迁移产物
- 为全局设置生成 `global` 规则
- 为 Feed 开关生成 `feed` 规则
- 优先级按固定模板分配（例如 100, 200, 300...），确保可预测

### 5.3 迁移触发
- 版本升级后首次访问规则中心或首次执行规则引擎前触发一次
- 迁移幂等：已存在迁移标记则跳过

## 6. API 设计（草案）

- `GET /api/automation-rules`
- `POST /api/automation-rules`
- `PATCH /api/automation-rules/:id`
- `DELETE /api/automation-rules/:id`
- `POST /api/automation-rules/reorder`（批量更新 priority）

DTO 保持稳定，前端统一通过 `src/lib/api/apiClient.ts` 封装。

## 7. 错误处理与可观测性

- 校验错误：复用 `ValidationError` 字段级返回
- 规则冲突：不报错，按优先级自然决议
- 执行失败：记录 `system log`，不影响后续动作求值
- 引擎异常兜底：回退到“无动作”并记录错误日志，避免阻塞主流程

## 8. 测试策略

### 8.1 后端
- `ruleEngineService`：
  - scope 命中
  - keyword/sourceLanguage/timeWindow 条件
  - priority 冲突决议
- repository：CRUD、唯一约束、排序更新
- route：请求校验、错误映射
- migration：旧配置到规则的幂等迁移

### 8.2 前端
- 规则中心列表/编辑/启停/优先级输入交互测试
- SettingsCenter 新 tab 切换与 autosave 协同
- API 错误提示复用现有通知链路

### 8.3 回归命令
1. `pnpm lint`
2. `pnpm type-check`
3. `pnpm test:unit`
4. 若设置中心交互改动较大，补跑 `pnpm build`

## 9. 风险与缓解

- 风险：旧配置与新规则双轨期间行为不一致
- 缓解：迁移后单一来源为规则中心，旧开关降级为只读提示

- 风险：规则条件扩展过快导致 schema 混乱
- 缓解：V1 固定条件结构，新增条件必须走 schema 版本演进

- 风险：优先级管理混乱
- 缓解：默认按 100 间隔分配，提供批量重排接口

## 10. 里程碑拆分

1. 数据层：migration + repo + types
2. 引擎层：matching + conflict resolution + action dispatcher
3. API 层：rules CRUD + reorder + migration trigger
4. 前端层：规则中心 tab + 编辑器 + 列表交互
5. 迁移与收口：旧配置映射、旧入口降级、回归验证
