# 自动化规则编辑器重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将自动化规则配置改为“按列表顺序驱动”的可视化规则编辑体验，并按需求精简列表展示。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — 共享工作流规则与检查项
- `.superwork/spec/frontend/index.md` — 前端改动范围与验证要求
- `.superwork/spec/backend/index.md` — 规则引擎执行语义与后端契约约束
- `.superwork/spec/shared/index.md` — 共享类型与 API 客户端契约

**Architecture:** 保持后端 `scopeRefId` 单值契约不变，在前端将“多选范围”展开为多条规则提交。列表顺序继续通过 `priority` 存储，但规则执行语义改为“从后往前执行，前面的规则覆盖后面的规则”。编辑器移除手工名称/优先级/启用配置，由配置自动生成名称并在列表侧控制启用状态。

**Tech Stack:** React, TypeScript, Zustand, Zod, Vitest, Testing Library

---

### Task 1: 重构规则表单数据模型与校验

**Files:**
- Modify: `src/features/automation-rules/utils/ruleFormSchema.ts`

- [ ] **Step 1: 重构 RuleFormValues 为配置驱动字段并新增范围多选字段**

```ts
export interface RuleFormValues {
  scopeType: AutomationRuleScopeType;
  selectedScopeRefIds: string[];
  triggerPhase: AutomationRuleTriggerPhase;
  keywordEnabled: boolean;
  keywordMode: 'any' | 'all';
  keywordValuesText: string;
  sourceLanguageEnabled: boolean;
  sourceLanguageValuesText: string;
  actionTypes: AutomationRuleActionType[];
}
```

- [ ] **Step 2: 调整 parseRuleFormValues 输出为“待生成规则配置”并补齐校验**

```ts
if (parsed.scopeType !== 'global' && parsed.selectedScopeRefIds.length === 0) {
  throw new z.ZodError([{ code: 'custom', path: ['selectedScopeRefIds'], message: '请至少选择一个范围' }]);
}
```

- [ ] **Step 3: 维持动作/条件解析逻辑并添加中文关键注释**

Run: `pnpm test:unit -- --run src/test/features/automation-rules/RulesCenterPanel.test.tsx`
Expected: PASS（允许后续步骤临时失败，最终需恢复）

### Task 2: 重构规则编辑弹窗 UI 与交互

**Files:**
- Modify: `src/features/automation-rules/components/RuleEditorDialog.tsx`

- [ ] **Step 1: 移除规则名称/优先级/启用配置，新增“触发条件”区块文案**

```tsx
<DialogDescription>按列表顺序从后往前执行；同执行类型前面的规则覆盖后面的规则。</DialogDescription>
```

- [ ] **Step 2: 新增范围多选 UI（分类/Feed）并按 scopeType 条件渲染**

```tsx
{values.scopeType !== 'global' ? (
  <div className="flex flex-wrap gap-2">{/* 多选按钮 */}</div>
) : null}
```

- [ ] **Step 3: 将关键词/语种条件合并到触发条件，并仅在启用时显示详情配置**

```tsx
{values.keywordEnabled ? <Textarea ... /> : null}
{values.sourceLanguageEnabled ? <Textarea ... /> : null}
```

### Task 3: 重构列表展示与提交流程

**Files:**
- Modify: `src/features/automation-rules/components/RulesCenterPanel.tsx`

- [ ] **Step 1: 列表仅保留首行信息，移除状态徽标与动作标签**

```tsx
<p className="truncate text-sm font-medium">{rule.name}</p>
```

- [ ] **Step 2: 将停用按钮改为开关，并保留上移/下移/编辑/删除**

```tsx
<Switch checked={rule.enabled} onCheckedChange={() => void handleToggleRule(rule)} />
```

- [ ] **Step 3: 编辑器提交改为自动生成规则名称 + 自动分配优先级 + 多选范围拆分提交**

```ts
// 非全局时，按选中范围拆分为多条规则创建/更新。
for (const scopeRefId of scopeRefIds) {
  await createAutomationRuleRequest(buildPayload(scopeRefId));
}
```

### Task 4: 调整规则引擎冲突覆盖语义

**Files:**
- Modify: `src/server/domains/automation-rules/services/ruleEngineService.ts`
- Modify: `src/test/server/services/ruleEngineService.test.ts`

- [ ] **Step 1: 将规则执行顺序改为“priority 倒序（列表后到前）”**

```ts
const sortedRules = [...input.rules].sort((a, b) => b.priority - a.priority || Number(b.id) - Number(a.id));
```

- [ ] **Step 2: 同动作类型改为后匹配覆盖先匹配（确保前排规则最终生效）**

```ts
actions[rule.actionType] = { ruleId: rule.id, actionConfig: rule.actionConfig };
```

- [ ] **Step 3: 更新单测描述，确保冲突覆盖语义可读**

Run: `pnpm test:unit -- --run src/test/server/services/ruleEngineService.test.ts`
Expected: PASS

### Task 5: 更新前端测试并执行回归

**Files:**
- Modify: `src/test/features/automation-rules/RulesCenterPanel.test.tsx`

- [ ] **Step 1: 按新表单交互更新测试步骤（不再填写名称/优先级）**

```ts
fireEvent.click(screen.getByLabelText('关键词条件'));
fireEvent.change(screen.getByPlaceholderText('每行一个关键词'), { target: { value: 'AI' } });
```

- [ ] **Step 2: 跑目标测试与类型检查（至少本次改动相关）**

Run: `pnpm test:unit -- --run src/test/features/automation-rules/RulesCenterPanel.test.tsx src/test/server/services/ruleEngineService.test.ts`
Expected: PASS

Run: `pnpm type-check`
Expected: PASS

