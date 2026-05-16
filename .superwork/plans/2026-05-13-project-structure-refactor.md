# FeedFuse 目录结构统一实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变业务行为的前提下，把项目统一为“分层 + 分域”目录结构，并完成所有导入路径迁移。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — 共享工作流与检查清单
- `.superwork/spec/guides/repo-map.md` — 当前仓库目录地图与命令约束
- `.superwork/spec/guides/change-boundaries.md` — 跨层边界与职责切分
- `.superwork/spec/guides/verification.md` — 重构任务验证策略
- `.superwork/spec/backend/structure.md` — 后端目录职责边界
- `.superwork/spec/frontend/structure.md` — 前端 feature 组织规范
- `.superwork/spec/shared/structure.md` — 共享层放置规则

**Architecture:** 保留 `src/app/api` 作为 HTTP 入口，不改路由行为。后端改为 `infra`、`integrations`、`domains` 三段式，前端保留 `features` 按域组织并补统一导出入口，`lib` 做语义分桶。全程只迁移文件路径与更新 import，不改函数逻辑。

**Tech Stack:** Next.js App Router, TypeScript, pnpm, Vitest, ESLint

---

### Task 1: 建立迁移骨架与基线检查

**Files:**
- Create: `src/server/infra/`
- Create: `src/server/integrations/`
- Create: `src/server/domains/`
- Modify: `src/**`（仅目录位置变更）

- [ ] **Step 1: 创建目标目录骨架**

```bash
mkdir -p src/server/infra src/server/integrations src/server/domains
mkdir -p src/server/domains/{auth,feeds,articles,settings,reader,ai-digests}/
mkdir -p src/server/domains/{auth,feeds,articles,settings,reader,ai-digests}/{services,repositories,tasks}
```

- [ ] **Step 2: 记录迁移前目录快照**

```bash
find src/server -maxdepth 3 -type d | sort > /tmp/feedfuse-server-before.txt
find src/features -maxdepth 3 -type d | sort > /tmp/feedfuse-features-before.txt
```

Run: `wc -l /tmp/feedfuse-server-before.txt /tmp/feedfuse-features-before.txt`
Expected: 输出两行计数与总计数。

- [ ] **Step 3: 运行迁移前类型检查**

Run: `pnpm type-check`
Expected: PASS。

### Task 2: 迁移后端 infra 与 integrations 并修复导入

**Files:**
- Move: `src/server/db/** -> src/server/infra/db/**`
- Move: `src/server/http/** -> src/server/infra/http/**`
- Move: `src/server/logging/** -> src/server/infra/logging/**`
- Move: `src/server/queue/** -> src/server/infra/queue/**`
- Move: `src/server/env.ts -> src/server/infra/env.ts`
- Move: `src/server/ai/** -> src/server/integrations/ai/**`
- Move: `src/server/rss/** -> src/server/integrations/rss/**`
- Move: `src/server/fulltext/** -> src/server/integrations/fulltext/**`
- Move: `src/server/media/** -> src/server/integrations/media/**`
- Move: `src/server/opml/** -> src/server/integrations/opml/**`

- [ ] **Step 1: 移动 infra 目录**

```bash
mv src/server/db src/server/infra/
mv src/server/http src/server/infra/
mv src/server/logging src/server/infra/
mv src/server/queue src/server/infra/
mv src/server/env.ts src/server/infra/env.ts
```

- [ ] **Step 2: 移动 integrations 目录**

```bash
mv src/server/ai src/server/integrations/
mv src/server/rss src/server/integrations/
mv src/server/fulltext src/server/integrations/
mv src/server/media src/server/integrations/
mv src/server/opml src/server/integrations/
```

- [ ] **Step 3: 批量更新导入路径（infra/integrations）**

```bash
python3 - <<'PY'
from pathlib import Path
repl = {
    "@/server/db": "@/server/infra/db",
    "@/server/http": "@/server/infra/http",
    "@/server/logging": "@/server/infra/logging",
    "@/server/queue": "@/server/infra/queue",
    "@/server/env": "@/server/infra/env",
    "@/server/ai": "@/server/integrations/ai",
    "@/server/rss": "@/server/integrations/rss",
    "@/server/fulltext": "@/server/integrations/fulltext",
    "@/server/media": "@/server/integrations/media",
    "@/server/opml": "@/server/integrations/opml",
}
for p in Path("src").rglob("*.ts*"):
    t = p.read_text()
    nt = t
    for a,b in repl.items():
        nt = nt.replace(a,b)
    if nt != t:
        p.write_text(nt)
PY
```

- [ ] **Step 4: 校验 infra/integrations 迁移结果**

Run: `pnpm type-check`
Expected: PASS。

### Task 3: 迁移后端 domains 并修复导入

**Files:**
- Move: `src/server/auth/*.ts -> src/server/domains/auth/services/*.ts`
- Move: `src/server/repositories/feedsRepo.ts -> src/server/domains/feeds/repositories/feedsRepo.ts`
- Move: `src/server/repositories/categoriesRepo.ts -> src/server/domains/feeds/repositories/categoriesRepo.ts`
- Move: `src/server/repositories/feedFaviconsRepo.ts -> src/server/domains/feeds/repositories/feedFaviconsRepo.ts`
- Move: `src/server/repositories/feedRefreshRunRepo.ts -> src/server/domains/feeds/repositories/feedRefreshRunRepo.ts`
- Move: `src/server/repositories/articlesRepo.ts -> src/server/domains/articles/repositories/articlesRepo.ts`
- Move: `src/server/repositories/articleAiSummaryRepo.ts -> src/server/domains/articles/repositories/articleAiSummaryRepo.ts`
- Move: `src/server/repositories/articleTasksRepo.ts -> src/server/domains/articles/repositories/articleTasksRepo.ts`
- Move: `src/server/repositories/articleTranslationRepo.ts -> src/server/domains/articles/repositories/articleTranslationRepo.ts`
- Move: `src/server/repositories/aiDigestRepo.ts -> src/server/domains/ai-digests/repositories/aiDigestRepo.ts`
- Move: `src/server/repositories/settingsRepo.ts -> src/server/domains/settings/repositories/settingsRepo.ts`
- Move: `src/server/repositories/systemLogsRepo.ts -> src/server/domains/settings/repositories/systemLogsRepo.ts`
- Move: `src/server/services/*.ts -> 对应 domains/*/services/*.ts`
- Move: `src/server/tasks/*.ts -> 对应 domains/*/tasks/*.ts`

- [ ] **Step 1: 按域移动 repositories/services/tasks/auth 文件**

```bash
mv src/server/auth/*.ts src/server/domains/auth/services/
mv src/server/repositories/feedsRepo.ts src/server/domains/feeds/repositories/
mv src/server/repositories/categoriesRepo.ts src/server/domains/feeds/repositories/
mv src/server/repositories/feedFaviconsRepo.ts src/server/domains/feeds/repositories/
mv src/server/repositories/feedRefreshRunRepo.ts src/server/domains/feeds/repositories/
mv src/server/repositories/articlesRepo.ts src/server/domains/articles/repositories/
mv src/server/repositories/articleAiSummaryRepo.ts src/server/domains/articles/repositories/
mv src/server/repositories/articleTasksRepo.ts src/server/domains/articles/repositories/
mv src/server/repositories/articleTranslationRepo.ts src/server/domains/articles/repositories/
mv src/server/repositories/aiDigestRepo.ts src/server/domains/ai-digests/repositories/
mv src/server/repositories/settingsRepo.ts src/server/domains/settings/repositories/
mv src/server/repositories/systemLogsRepo.ts src/server/domains/settings/repositories/
mv src/server/services/feedCategoryLifecycleService.ts src/server/domains/feeds/services/
mv src/server/services/feedFaviconService.ts src/server/domains/feeds/services/
mv src/server/services/feedRefreshRunService.ts src/server/domains/feeds/services/
mv src/server/services/articleDuplicateService.ts src/server/domains/articles/services/
mv src/server/services/articleFilterService.ts src/server/domains/articles/services/
mv src/server/services/articleKeywordFilter.ts src/server/domains/articles/services/
mv src/server/services/readerSnapshotService.ts src/server/domains/reader/services/
mv src/server/services/aiDigestLifecycleService.ts src/server/domains/ai-digests/services/
mv src/server/services/systemLogsService.ts src/server/domains/settings/services/
mv src/server/services/opmlService.ts src/server/domains/settings/services/
mv src/server/tasks/errorMapping.ts src/server/domains/settings/tasks/
mv src/server/tasks/feedFetchErrorMapping.ts src/server/domains/feeds/tasks/
mv src/server/tasks/rawErrorMessage.ts src/server/domains/settings/tasks/
```

- [ ] **Step 2: 批量更新导入路径（domains）**

```bash
python3 - <<'PY'
from pathlib import Path
repl = {
    "@/server/auth": "@/server/domains/auth/services",
    "@/server/repositories/feedsRepo": "@/server/domains/feeds/repositories/feedsRepo",
    "@/server/repositories/categoriesRepo": "@/server/domains/feeds/repositories/categoriesRepo",
    "@/server/repositories/feedFaviconsRepo": "@/server/domains/feeds/repositories/feedFaviconsRepo",
    "@/server/repositories/feedRefreshRunRepo": "@/server/domains/feeds/repositories/feedRefreshRunRepo",
    "@/server/repositories/articlesRepo": "@/server/domains/articles/repositories/articlesRepo",
    "@/server/repositories/articleAiSummaryRepo": "@/server/domains/articles/repositories/articleAiSummaryRepo",
    "@/server/repositories/articleTasksRepo": "@/server/domains/articles/repositories/articleTasksRepo",
    "@/server/repositories/articleTranslationRepo": "@/server/domains/articles/repositories/articleTranslationRepo",
    "@/server/repositories/aiDigestRepo": "@/server/domains/ai-digests/repositories/aiDigestRepo",
    "@/server/repositories/settingsRepo": "@/server/domains/settings/repositories/settingsRepo",
    "@/server/repositories/systemLogsRepo": "@/server/domains/settings/repositories/systemLogsRepo",
    "@/server/services/feedCategoryLifecycleService": "@/server/domains/feeds/services/feedCategoryLifecycleService",
    "@/server/services/feedFaviconService": "@/server/domains/feeds/services/feedFaviconService",
    "@/server/services/feedRefreshRunService": "@/server/domains/feeds/services/feedRefreshRunService",
    "@/server/services/articleDuplicateService": "@/server/domains/articles/services/articleDuplicateService",
    "@/server/services/articleFilterService": "@/server/domains/articles/services/articleFilterService",
    "@/server/services/articleKeywordFilter": "@/server/domains/articles/services/articleKeywordFilter",
    "@/server/services/readerSnapshotService": "@/server/domains/reader/services/readerSnapshotService",
    "@/server/services/aiDigestLifecycleService": "@/server/domains/ai-digests/services/aiDigestLifecycleService",
    "@/server/services/systemLogsService": "@/server/domains/settings/services/systemLogsService",
    "@/server/services/opmlService": "@/server/domains/settings/services/opmlService",
    "@/server/tasks/feedFetchErrorMapping": "@/server/domains/feeds/tasks/feedFetchErrorMapping",
    "@/server/tasks/errorMapping": "@/server/domains/settings/tasks/errorMapping",
    "@/server/tasks/rawErrorMessage": "@/server/domains/settings/tasks/rawErrorMessage",
}
for p in Path("src").rglob("*.ts*"):
    t = p.read_text()
    nt = t
    for a,b in repl.items():
        nt = nt.replace(a,b)
    if nt != t:
        p.write_text(nt)
PY
```

- [ ] **Step 3: 清理空目录并执行校验**

Run: `find src/server -type d -empty -delete && pnpm type-check`
Expected: PASS。

### Task 4: 整理前端 features 与 shared lib 语义分桶

**Files:**
- Move: `src/features/feeds/services/rssValidationService.ts -> src/features/feeds/utils/rssValidation.ts`
- Create: `src/features/articles/index.ts`
- Create: `src/features/auth/index.ts`
- Create: `src/features/feeds/index.ts`
- Create: `src/features/reader/index.ts`
- Create: `src/features/settings/index.ts`
- Create: `src/features/toast/index.ts`
- Create: `src/lib/{api,ui,reader,feeds}/`
- Move: `src/lib/*.ts -> src/lib/{api,ui,reader,feeds}/`（按语义）

- [ ] **Step 1: 迁移 feeds 域服务文件到 utils**

```bash
mkdir -p src/features/feeds/utils
mv src/features/feeds/services/rssValidationService.ts src/features/feeds/utils/rssValidation.ts
rmdir src/features/feeds/services || true
```

- [ ] **Step 2: 创建 features 统一导出入口**

```ts
// src/features/feeds/index.ts
export * from './components';
export * from './hooks';
export * from './utils';
```

```bash
for d in articles auth feeds reader settings toast; do
  cat > "src/features/$d/index.ts" <<'TS'
export * from './components';
TS
done
```

- [ ] **Step 3: 分桶迁移 lib 并更新导入**

```bash
mkdir -p src/lib/api src/lib/ui src/lib/reader src/lib/feeds
mv src/lib/apiClient.ts src/lib/api/
mv src/lib/apiErrorNotifier.ts src/lib/api/
mv src/lib/mapApiErrorToUserMessage.ts src/lib/api/
mv src/lib/polling.ts src/lib/api/
mv src/lib/designSystem.ts src/lib/ui/
mv src/lib/articleSummary.ts src/lib/reader/
mv src/lib/view.ts src/lib/reader/
mv src/lib/feedAutoTriggerPolicy.ts src/lib/feeds/
mv src/lib/feedIcons.ts src/lib/feeds/
```

```bash
python3 - <<'PY'
from pathlib import Path
repl = {
    "@/lib/apiClient": "@/lib/api/apiClient",
    "@/lib/apiErrorNotifier": "@/lib/api/apiErrorNotifier",
    "@/lib/mapApiErrorToUserMessage": "@/lib/api/mapApiErrorToUserMessage",
    "@/lib/polling": "@/lib/api/polling",
    "@/lib/designSystem": "@/lib/ui/designSystem",
    "@/lib/articleSummary": "@/lib/reader/articleSummary",
    "@/lib/view": "@/lib/reader/view",
    "@/lib/feedAutoTriggerPolicy": "@/lib/feeds/feedAutoTriggerPolicy",
    "@/lib/feedIcons": "@/lib/feeds/feedIcons",
    "@/features/feeds/services/rssValidationService": "@/features/feeds/utils/rssValidation",
}
for p in Path("src").rglob("*.ts*"):
    t = p.read_text()
    nt = t
    for a,b in repl.items():
        nt = nt.replace(a,b)
    if nt != t:
        p.write_text(nt)
PY
```

- [ ] **Step 4: 执行 lint 与类型检查**

Run: `pnpm lint && pnpm type-check`
Expected: PASS。

### Task 5: 同步测试路径并做最终回归

**Files:**
- Modify: `src/test/**`（仅导入路径）
- Modify: `.superwork/spec/**`（如需更新路径说明）

- [ ] **Step 1: 搜索残留旧路径并修复**

Run: `rg "@/server/(db|http|logging|queue|env|ai|rss|fulltext|media|opml|services|repositories|tasks|auth)|@/lib/(apiClient|apiErrorNotifier|mapApiErrorToUserMessage|polling|designSystem|articleSummary|view|feedAutoTriggerPolicy|feedIcons)|@/features/feeds/services/rssValidationService" src`
Expected: 无输出。

- [ ] **Step 2: 跑全量单测**

Run: `pnpm test:unit`
Expected: PASS。

- [ ] **Step 3: 跑最终质量门禁**

Run: `pnpm lint && pnpm type-check && pnpm test:unit`
Expected: 全部 PASS。

- [ ] **Step 4: 输出迁移后目录快照并对比**

Run: `find src/server -maxdepth 4 -type d | sort > /tmp/feedfuse-server-after.txt && diff -u /tmp/feedfuse-server-before.txt /tmp/feedfuse-server-after.txt | head -200`
Expected: 能看到 `infra`、`integrations`、`domains` 新结构。
