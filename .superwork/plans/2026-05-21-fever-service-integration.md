# Fever Service Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 FeedFuse 新增 Fever 服务端 RSS 来源、双向已读收藏写回和统一阅读增强链路。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — 共享工作流规则和跨层检查项
- `.superwork/spec/guides/change-boundaries.md` — route、service、repository、worker 的职责边界
- `.superwork/spec/backend/index.md` — 后端目录范围与验证要求
- `.superwork/spec/backend/contracts.md` — route、service、repository、worker、迁移契约
- `.superwork/spec/backend/quality.md` — 后端测试与迁移质量门槛
- `.superwork/spec/frontend/index.md` — 前端 reader/feed/settings 变更范围
- `.superwork/spec/frontend/contracts.md` — feed 与 article 的前端消费契约
- `.superwork/spec/guides/verification.md` — 默认验证基线

**Architecture:** 通过新增 Fever account、feed/item 映射和同步状态表，把 Fever 上游对象投影到现有 `feeds` 与 `articles` 执行模型中。阅读器、AI 全文/摘要/翻译链路继续复用本地模型，已读与收藏操作通过 service 先回写 Fever 再提交本地状态。

**Tech Stack:** Next.js Route Handlers、TypeScript、PostgreSQL、pg-boss、Vitest、pnpm

---

### Task 1: 扩展数据模型并建立 Fever 映射迁移

**Files:**

- Modify: `src/server/infra/db/migrations/`
- Modify: `src/types/index.ts`
- Modify: `src/server/domains/feeds/repositories/feedsRepo.ts`
- Test: `src/test/server/db/migrations/`
- Test: `src/test/server/repositories/feedsRepo.kind.test.ts`

- [ ] **Step 1: 写 migration 测试，先固定新 provider 与 Fever 表结构**

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('fever migration', () => {
  it('adds fever provider and mapping tables', () => {
    const sql = readFileSync(
      'src/server/infra/db/migrations/0029_fever_sources.sql',
      'utf8',
    );

    expect(sql).toContain("check (provider in ('local_rss', 'fever'))");
    expect(sql).toContain('create table if not exists fever_accounts');
    expect(sql).toContain('create table if not exists fever_feed_mappings');
    expect(sql).toContain('create table if not exists fever_item_mappings');
    expect(sql).toContain('create table if not exists fever_sync_states');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test:unit -- --run src/test/server/db/migrations/feverSourcesMigration.test.ts`  
Expected: FAIL，提示 `0029_fever_sources.sql` 不存在或断言未满足

- [ ] **Step 3: 新增迁移与基础类型，最小实现 provider/account/mapping 结构**

```sql
alter table feeds
  add column if not exists provider text not null default 'local_rss',
  add constraint feeds_provider_check
    check (provider in ('local_rss', 'fever'));

create table if not exists fever_accounts (
  id bigserial primary key,
  base_url text not null,
  username text not null,
  api_key text not null,
  enabled boolean not null default true,
  last_sync_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fever_feed_mappings (
  fever_account_id bigint not null references fever_accounts(id) on delete cascade,
  fever_feed_id text not null,
  local_feed_id bigint not null references feeds(id) on delete cascade,
  remote_group_name text null,
  remote_title text not null,
  remote_url text not null,
  remote_favicon_url text null,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  primary key (fever_account_id, fever_feed_id)
);

create table if not exists fever_item_mappings (
  fever_account_id bigint not null references fever_accounts(id) on delete cascade,
  fever_item_id text not null,
  fever_feed_id text not null,
  local_feed_id bigint not null references feeds(id) on delete cascade,
  local_article_id bigint not null references articles(id) on delete cascade,
  remote_is_read boolean not null default false,
  remote_is_saved boolean not null default false,
  remote_created_at timestamptz null,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  primary key (fever_account_id, fever_item_id)
);

create table if not exists fever_sync_states (
  fever_account_id bigint primary key references fever_accounts(id) on delete cascade,
  last_incremental_item_id text null,
  last_incremental_synced_at timestamptz null,
  last_full_sync_at timestamptz null,
  last_error text null,
  updated_at timestamptz not null default now()
);
```

```ts
export type FeedProvider = 'local_rss' | 'fever';

export interface Feed {
  id: string;
  kind: FeedKind;
  provider: FeedProvider;
  remoteManaged?: boolean;
  remoteSource?: 'fever' | null;
  title: string;
  url: string;
}
```

- [ ] **Step 4: 更新 `feedsRepo` 的查询返回 provider 字段**

```ts
export interface FeedRow {
  id: string;
  kind: FeedKind;
  provider: 'local_rss' | 'fever';
  title: string;
}

select
  id,
  kind,
  provider,
  title,
  url
from feeds
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm test:unit -- --run src/test/server/db/migrations/feverSourcesMigration.test.ts src/test/server/repositories/feedsRepo.kind.test.ts`  
Expected: PASS

- [ ] **Step 6: 提交本任务**

```bash
git add src/server/infra/db/migrations src/types/index.ts src/server/domains/feeds/repositories/feedsRepo.ts src/test/server/db/migrations src/test/server/repositories/feedsRepo.kind.test.ts
git commit -m "feat(fever): 添加Fever数据模型基础" -m $'- 添加 Fever 账号与映射迁移\n- 扩展 feed provider 字段与查询返回'
```

### Task 2: 新建 Fever integration 客户端与协议错误映射

**Files:**

- Create: `src/server/integrations/fever/feverClient.ts`
- Create: `src/server/integrations/fever/feverSchemas.ts`
- Create: `src/server/integrations/fever/feverErrors.ts`
- Test: `src/test/server/integrations/fever/feverClient.test.ts`

- [ ] **Step 1: 写 failing test，覆盖认证、feeds/items 拉取与 mark 请求组装**

```ts
import { describe, expect, it, vi } from 'vitest';

describe('feverClient', () => {
  it('posts api payload with fever auth and parses feeds response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        api_version: 3,
        auth: 1,
        feeds: [{ id: '1', title: 'Feed', url: 'https://example.com/feed' }],
      }),
    });

    const { createFeverClient } = await import('@/server/integrations/fever/feverClient');
    const client = createFeverClient({
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
      fetchImpl,
    });

    const result = await client.listFeeds();

    expect(fetchImpl).toHaveBeenCalled();
    expect(result[0]?.id).toBe('1');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test:unit -- --run src/test/server/integrations/fever/feverClient.test.ts`  
Expected: FAIL，提示模块不存在

- [ ] **Step 3: 实现最小 Fever client 与 schema 解析**

```ts
export function createFeverClient(input: {
  baseUrl: string;
  username: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;

  async function request(params: URLSearchParams) {
    const body = new URLSearchParams({
      api_key: md5(`${input.username}:${input.apiKey}`),
      ...Object.fromEntries(params),
    });

    const response = await fetchImpl(`${input.baseUrl.replace(/\/$/, '')}/?api`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });

    const json = await response.json();
    return feverEnvelopeSchema.parse(json);
  }

  return {
    async listFeeds() {
      const json = await request(new URLSearchParams({ feeds: '1' }));
      return json.feeds ?? [];
    },
    async listItems(sinceId?: string) {
      const params = new URLSearchParams({ items: '1' });
      if (sinceId) params.set('since_id', sinceId);
      const json = await request(params);
      return json.items ?? [];
    },
    async markItem(input: { itemId: string; as: 'read' | 'unread' | 'saved' | 'unsaved' }) {
      await request(new URLSearchParams({
        mark: 'item',
        id: input.itemId,
        as: input.as,
      }));
    },
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test:unit -- --run src/test/server/integrations/fever/feverClient.test.ts`  
Expected: PASS

- [ ] **Step 5: 提交本任务**

```bash
git add src/server/integrations/fever src/test/server/integrations/fever/feverClient.test.ts
git commit -m "feat(fever): 添加Fever协议客户端" -m $'- 添加 Fever 请求封装与响应解析\n- 统一认证和标记写回入口'
```

### Task 3: 建立 Fever repository 与同步 service

**Files:**

- Create: `src/server/domains/fever/repositories/feverAccountsRepo.ts`
- Create: `src/server/domains/fever/repositories/feverMappingsRepo.ts`
- Create: `src/server/domains/fever/services/feverSyncService.ts`
- Test: `src/test/server/repositories/feverMappingsRepo.test.ts`
- Test: `src/test/server/services/feverSyncService.test.ts`

- [ ] **Step 1: 写 repository 与 service failing tests，覆盖首次投影与失效标记**

```ts
it('projects remote feeds into local feeds and mappings', async () => {
  const result = await syncFeverAccount(pool, {
    accountId: '1',
    client,
  });

  expect(result.createdFeeds).toBe(1);
  expect(result.createdArticles).toBe(2);
});

it('marks missing remote items inactive during full sync', async () => {
  await reconcileFeverItems(pool, {
    accountId: '1',
    seenRemoteItemIds: ['remote-2'],
  });

  expect(markInactiveSpy).toHaveBeenCalledWith(pool, '1', ['remote-1']);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test:unit -- --run src/test/server/repositories/feverMappingsRepo.test.ts src/test/server/services/feverSyncService.test.ts`  
Expected: FAIL，提示 repository/service 不存在

- [ ] **Step 3: 实现 mapping repository 与同步 service 的最小投影逻辑**

```ts
export async function upsertFeverFeedMapping(db: DbClient, input: {
  accountId: string;
  feverFeedId: string;
  localFeedId: string;
  remoteTitle: string;
  remoteUrl: string;
  remoteGroupName: string | null;
}) {
  await db.query(
    `
      insert into fever_feed_mappings(
        fever_account_id,
        fever_feed_id,
        local_feed_id,
        remote_group_name,
        remote_title,
        remote_url,
        is_active,
        last_seen_at
      )
      values ($1, $2, $3, $4, $5, $6, true, now())
      on conflict (fever_account_id, fever_feed_id)
      do update set
        local_feed_id = excluded.local_feed_id,
        remote_group_name = excluded.remote_group_name,
        remote_title = excluded.remote_title,
        remote_url = excluded.remote_url,
        is_active = true,
        last_seen_at = now()
    `,
    [input.accountId, input.feverFeedId, input.localFeedId, input.remoteGroupName, input.remoteTitle, input.remoteUrl],
  );
}
```

```ts
export async function syncFeverAccount(pool: Pool, input: {
  accountId: string;
  client: FeverClient;
}) {
  const feeds = await input.client.listFeeds();
  const items = await input.client.listItems();

  for (const remoteFeed of feeds) {
    const localFeed = await ensureProjectedFeed(pool, remoteFeed);
    await upsertFeverFeedMapping(pool, {
      accountId: input.accountId,
      feverFeedId: remoteFeed.id,
      localFeedId: localFeed.id,
      remoteTitle: remoteFeed.title,
      remoteUrl: remoteFeed.url,
      remoteGroupName: null,
    });
  }

  for (const remoteItem of items) {
    await projectFeverItem(pool, {
      accountId: input.accountId,
      remoteItem,
    });
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test:unit -- --run src/test/server/repositories/feverMappingsRepo.test.ts src/test/server/services/feverSyncService.test.ts`  
Expected: PASS

- [ ] **Step 5: 提交本任务**

```bash
git add src/server/domains/fever src/test/server/repositories/feverMappingsRepo.test.ts src/test/server/services/feverSyncService.test.ts
git commit -m "feat(fever): 添加Fever同步服务" -m $'- 添加 Fever 账号与映射仓储\n- 实现 feed 和 item 的本地投影同步'
```

### Task 4: 将 Fever 文章接入现有文章入库与自动化链路

**Files:**

- Modify: `src/server/domains/articles/repositories/articlesRepo.ts`
- Modify: `src/server/domains/feeds/repositories/feedsRepo.ts`
- Modify: `src/server/domains/fever/services/feverSyncService.ts`
- Test: `src/test/server/services/feverSyncService.test.ts`
- Test: `src/test/server/repositories/articlesRepo.*.test.ts`

- [ ] **Step 1: 写 failing test，覆盖 Fever 新文章投影后可复用现有 article 字段与自动化触发**

```ts
it('creates projected articles with remote read and saved state', async () => {
  await projectFeverItem(pool, {
    accountId: '1',
    remoteItem: {
      id: 'remote-1',
      feedId: 'feed-1',
      title: 'Hello',
      url: 'https://example.com/post',
      isRead: true,
      isSaved: false,
    },
  });

  expect(insertArticleIgnoreDuplicateMock).toHaveBeenCalledWith(
    pool,
    expect.objectContaining({
      title: 'Hello',
      link: 'https://example.com/post',
    }),
  );
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test:unit -- --run src/test/server/services/feverSyncService.test.ts`  
Expected: FAIL，断言当前投影逻辑未设置文章状态或未建立映射

- [ ] **Step 3: 在投影逻辑中复用现有文章入库，并同步远端已读收藏状态**

```ts
const created = await insertArticleIgnoreDuplicate(pool, {
  feedId: localFeedId,
  dedupeKey: `fever:${accountId}:${remoteItem.id}`,
  title: remoteItem.title || '(untitled)',
  link: remoteItem.url ?? null,
  author: remoteItem.author ?? null,
  publishedAt: remoteItem.createdAt ?? new Date().toISOString(),
  contentHtml: remoteItem.html ?? null,
  summary: remoteItem.summary ?? null,
  filterStatus: 'passed',
  isFiltered: false,
});

if (created) {
  await setArticleRead(pool, created.id, remoteItem.isRead);
  await setArticleStarred(pool, created.id, remoteItem.isSaved);
  await upsertFeverItemMapping(pool, {
    accountId,
    feverItemId: remoteItem.id,
    localArticleId: created.id,
    localFeedId,
    feverFeedId: remoteItem.feedId,
    remoteIsRead: remoteItem.isRead,
    remoteIsSaved: remoteItem.isSaved,
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test:unit -- --run src/test/server/services/feverSyncService.test.ts src/test/server/repositories/articlesRepo.markAllRead.test.ts`  
Expected: PASS

- [ ] **Step 5: 提交本任务**

```bash
git add src/server/domains/articles/repositories/articlesRepo.ts src/server/domains/feeds/repositories/feedsRepo.ts src/server/domains/fever/services/feverSyncService.ts src/test/server/services/feverSyncService.test.ts
git commit -m "feat(fever): 打通Fever文章投影入库" -m $'- 复用现有文章模型承载 Fever item\n- 同步远端已读收藏状态到本地文章'
```

### Task 5: 新增 Fever 写回 service 并接管文章状态更新 API

**Files:**

- Create: `src/server/domains/fever/services/feverWritebackService.ts`
- Modify: `src/app/api/articles/[id]/route.ts`
- Modify: `src/app/api/articles/mark-all-read/route.ts`
- Test: `src/test/server/services/feverWritebackService.test.ts`
- Test: `src/test/app/api/articles/[id]/route.test.ts`
- Test: `src/test/app/api/articles/mark-all-read/route.test.ts`

- [ ] **Step 1: 写 failing tests，覆盖单篇已读/收藏与批量已读先回写远端再改本地**

```ts
it('writes fever read state remotely before committing local update', async () => {
  await updateArticleStateWithWriteback(pool, {
    articleId: '1',
    isRead: true,
  });

  expect(markItemMock).toHaveBeenCalledWith({
    itemId: 'remote-1',
    as: 'read',
  });
  expect(setArticleReadMock).toHaveBeenCalledWith(pool, '1', true);
});

it('does not commit local state when fever writeback fails', async () => {
  markItemMock.mockRejectedValueOnce(new Error('boom'));

  await expect(
    updateArticleStateWithWriteback(pool, { articleId: '1', isStarred: true }),
  ).rejects.toThrow('boom');

  expect(setArticleStarredMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test:unit -- --run src/test/server/services/feverWritebackService.test.ts src/test/app/api/articles/[id]/route.test.ts src/test/app/api/articles/mark-all-read/route.test.ts`  
Expected: FAIL，当前 route 直接更新本地状态

- [ ] **Step 3: 实现 writeback service，并让 route 改为调用 service**

```ts
export async function updateArticleStateWithWriteback(pool: Pool, input: {
  articleId: string;
  isRead?: boolean;
  isStarred?: boolean;
}) {
  const mapping = await getFeverItemMappingByLocalArticleId(pool, input.articleId);

  if (!mapping) {
    if (typeof input.isRead !== 'undefined') {
      await setArticleRead(pool, input.articleId, input.isRead);
    }
    if (typeof input.isStarred !== 'undefined') {
      await setArticleStarred(pool, input.articleId, input.isStarred);
    }
    return;
  }

  const client = await createClientForAccount(pool, mapping.feverAccountId);

  if (typeof input.isRead !== 'undefined') {
    await client.markItem({
      itemId: mapping.feverItemId,
      as: input.isRead ? 'read' : 'unread',
    });
    await setArticleRead(pool, input.articleId, input.isRead);
  }

  if (typeof input.isStarred !== 'undefined') {
    await client.markItem({
      itemId: mapping.feverItemId,
      as: input.isStarred ? 'saved' : 'unsaved',
    });
    await setArticleStarred(pool, input.articleId, input.isStarred);
  }
}
```

```ts
await updateArticleStateWithWriteback(pool, {
  articleId: paramsParsed.data.id,
  isRead,
  isStarred,
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test:unit -- --run src/test/server/services/feverWritebackService.test.ts src/test/app/api/articles/[id]/route.test.ts src/test/app/api/articles/mark-all-read/route.test.ts`  
Expected: PASS

- [ ] **Step 5: 提交本任务**

```bash
git add src/server/domains/fever/services/feverWritebackService.ts src/app/api/articles/[id]/route.ts src/app/api/articles/mark-all-read/route.ts src/test/server/services/feverWritebackService.test.ts src/test/app/api/articles/[id]/route.test.ts src/test/app/api/articles/mark-all-read/route.test.ts
git commit -m "feat(fever): 接管文章状态双向写回" -m $'- 添加 Fever 文章状态写回服务\n- 更新文章接口先回写远端再提交本地'
```

### Task 6: 扩展 reader snapshot 和 feed API 返回来源字段与失效过滤

**Files:**

- Modify: `src/server/domains/reader/services/readerSnapshotService.ts`
- Modify: `src/app/api/feeds/route.ts`
- Modify: `src/lib/api/apiClient.ts`
- Modify: `src/types/index.ts`
- Test: `src/test/server/services/readerSnapshotService.test.ts`
- Test: `src/test/lib/apiClient.test.ts`
- Test: `src/test/app/api/feeds/routes.test.ts`

- [ ] **Step 1: 写 failing tests，覆盖 provider/remoteManaged 字段与失效 Fever item 过滤**

```ts
it('returns provider and remoteManaged for fever feeds', async () => {
  const snapshot = await getReaderSnapshot(pool, { view: 'all', limit: 10 });
  expect(snapshot.feeds[0]).toMatchObject({
    provider: 'fever',
    remoteManaged: true,
    remoteSource: 'fever',
  });
});

it('excludes inactive fever items from article list', async () => {
  const snapshot = await getReaderSnapshot(pool, { view: 'all', limit: 10 });
  expect(snapshot.articles.items.map((item) => item.id)).not.toContain('article-removed');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test:unit -- --run src/test/server/services/readerSnapshotService.test.ts src/test/lib/apiClient.test.ts src/test/app/api/feeds/routes.test.ts`  
Expected: FAIL，当前 DTO 不包含来源字段，快照也未过滤 mapping 失效状态

- [ ] **Step 3: 最小修改 snapshot、feed route 和 apiClient**

```ts
export interface ReaderSnapshotFeed {
  id: string;
  kind: 'rss' | 'ai_digest';
  provider: 'local_rss' | 'fever';
  remoteManaged: boolean;
  remoteSource: 'fever' | null;
  title: string;
}
```

```sql
left join fever_feed_mappings ffm
  on ffm.local_feed_id = feeds.id
 and ffm.is_active = true

where not exists (
  select 1
  from fever_item_mappings fim
  where fim.local_article_id = articles.id
    and fim.is_active = false
)
```

```ts
return {
  id: dto.id,
  kind: dto.kind,
  provider: dto.provider ?? 'local_rss',
  remoteManaged: dto.provider === 'fever',
  remoteSource: dto.provider === 'fever' ? 'fever' : null,
  title: dto.title,
};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test:unit -- --run src/test/server/services/readerSnapshotService.test.ts src/test/lib/apiClient.test.ts src/test/app/api/feeds/routes.test.ts`  
Expected: PASS

- [ ] **Step 5: 提交本任务**

```bash
git add src/server/domains/reader/services/readerSnapshotService.ts src/app/api/feeds/route.ts src/lib/api/apiClient.ts src/types/index.ts src/test/server/services/readerSnapshotService.test.ts src/test/lib/apiClient.test.ts src/test/app/api/feeds/routes.test.ts
git commit -m "feat(fever): 扩展阅读快照来源字段" -m $'- 返回 Fever 来源与远端托管标识\n- 过滤已失效的 Fever feed 和 item'
```

### Task 7: 新增 Fever worker 与队列调度

**Files:**

- Modify: `src/server/infra/queue/jobs.ts`
- Modify: `src/server/infra/queue/contracts.ts`
- Modify: `src/worker/index.ts`
- Create: `src/worker/feverSync.ts`
- Test: `src/test/server/queue/jobs.test.ts`
- Test: `src/test/worker/feverSync.test.ts`

- [ ] **Step 1: 写 failing test，覆盖新任务名与 worker 调用同步 service**

```ts
it('exports fever sync job name', async () => {
  const { JOB_FEVER_SYNC } = await import('@/server/infra/queue/jobs');
  expect(JOB_FEVER_SYNC).toBe('fever.sync');
});

it('runs fever sync worker with account id', async () => {
  await runFeverSyncWorker({
    pool,
    clientFactory,
    data: { accountId: '1' },
  });

  expect(syncFeverAccountMock).toHaveBeenCalledWith(pool, expect.objectContaining({
    accountId: '1',
  }));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test:unit -- --run src/test/server/queue/jobs.test.ts src/test/worker/feverSync.test.ts`  
Expected: FAIL，当前无 `fever.sync`

- [ ] **Step 3: 新增任务常量、契约与 worker 实现**

```ts
export const JOB_FEVER_SYNC = 'fever.sync';
```

```ts
'fever.sync': {
  retryLimit: 3,
  retryDelay: 30,
  expireInHours: 1,
  retentionDays: 7,
}
```

```ts
export async function runFeverSyncWorker(input: {
  pool: Pool;
  data: { accountId: string };
}) {
  const client = await createClientForAccount(input.pool, input.data.accountId);
  await syncFeverAccount(input.pool, {
    accountId: input.data.accountId,
    client,
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test:unit -- --run src/test/server/queue/jobs.test.ts src/test/worker/feverSync.test.ts`  
Expected: PASS

- [ ] **Step 5: 提交本任务**

```bash
git add src/server/infra/queue/jobs.ts src/server/infra/queue/contracts.ts src/worker/index.ts src/worker/feverSync.ts src/test/server/queue/jobs.test.ts src/test/worker/feverSync.test.ts
git commit -m "feat(fever): 添加Fever同步队列任务" -m $'- 新增 fever.sync 任务与 worker 入口\n- 让 Fever 增量同步进入现有队列体系'
```

### Task 8: 新增 Fever account API 与设置页入口

**Files:**

- Create: `src/app/api/fever/accounts/route.ts`
- Create: `src/app/api/fever/accounts/[id]/sync/route.ts`
- Modify: `src/lib/api/apiClient.ts`
- Modify: `src/features/settings/**`
- Test: `src/test/app/api/fever/accounts/routes.test.ts`
- Test: `src/test/features/settings/`

- [ ] **Step 1: 写 failing tests，覆盖新增账号、测试连接、立即同步入口**

```ts
it('POST creates fever account and returns connection status', async () => {
  const response = await POST(
    new Request('http://localhost/api/fever/accounts', {
      method: 'POST',
      body: JSON.stringify({
        baseUrl: 'https://reader.example.com',
        username: 'demo',
        apiKey: 'secret',
      }),
    }),
  );

  const json = await response.json();
  expect(json.ok).toBe(true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test:unit -- --run src/test/app/api/fever/accounts/routes.test.ts`  
Expected: FAIL，路由不存在

- [ ] **Step 3: 实现最小 API 与设置页表单入口**

```ts
export async function POST(request: Request) {
  const body = await request.json();
  const account = await createFeverAccount(getPool(), body);
  return ok(account);
}
```

```ts
export async function syncFeverAccountNow(accountId: string) {
  return requestApi(`/api/fever/accounts/${encodeURIComponent(accountId)}/sync`, {
    method: 'POST',
  });
}
```

```tsx
<Button onClick={() => syncFeverAccountNow(account.id)}>
  立即同步
</Button>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test:unit -- --run src/test/app/api/fever/accounts/routes.test.ts src/test/features/settings/feverAccountSettings.test.tsx`  
Expected: PASS

- [ ] **Step 5: 提交本任务**

```bash
git add src/app/api/fever src/lib/api/apiClient.ts src/features/settings src/test/app/api/fever/accounts/routes.test.ts src/test/features/settings/feverAccountSettings.test.tsx
git commit -m "feat(settings): 添加Fever账号管理入口" -m $'- 添加 Fever 账号创建与同步接口\n- 在设置页提供连接与立即同步入口'
```

### Task 9: 收紧 FeedList 和编辑弹窗的 Fever 交互边界

**Files:**

- Modify: `src/features/feeds/components/FeedList.tsx`
- Modify: `src/features/feeds/components/EditFeedDialog.tsx`
- Test: `src/test/features/feeds/FeedList.test.tsx`
- Test: `src/test/features/feeds/EditFeedDialog.test.tsx`

- [ ] **Step 1: 写 failing tests，覆盖 Fever badge 与只读字段**

```tsx
it('shows Fever badge for fever feeds', async () => {
  render(<FeedList initialSelectedView="all" />);
  expect(await screen.findByText('Fever')).toBeInTheDocument();
});

it('disables title and url inputs for fever feeds', async () => {
  render(
    <EditFeedDialog
      open
      feed={{ id: '1', provider: 'fever', title: 'Feed', url: 'https://example.com/feed' }}
      categories={[]}
      onOpenChange={() => {}}
      onSubmit={vi.fn()}
    />,
  );

  expect(screen.getByLabelText('标题')).toBeDisabled();
  expect(screen.getByLabelText('RSS 地址')).toBeDisabled();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test:unit -- --run src/test/features/feeds/FeedList.test.tsx src/test/features/feeds/EditFeedDialog.test.tsx`  
Expected: FAIL，当前 UI 无 Fever 来源边界

- [ ] **Step 3: 最小实现来源标记与只读限制**

```tsx
{feed.provider === 'fever' ? (
  <span className="feed-source-badge">Fever</span>
) : null}
```

```tsx
const isRemoteManaged = feed?.provider === 'fever';

<Input
  aria-label="标题"
  disabled={isRemoteManaged}
  value={title}
  onChange={(event) => setTitle(event.target.value)}
/>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test:unit -- --run src/test/features/feeds/FeedList.test.tsx src/test/features/feeds/EditFeedDialog.test.tsx`  
Expected: PASS

- [ ] **Step 5: 提交本任务**

```bash
git add src/features/feeds/components/FeedList.tsx src/features/feeds/components/EditFeedDialog.tsx src/test/features/feeds/FeedList.test.tsx src/test/features/feeds/EditFeedDialog.test.tsx
git commit -m "feat(feeds): 收紧Fever订阅源交互边界" -m $'- 添加 Fever 来源标记\n- 将远端托管字段改为只读展示'
```

### Task 10: 跑分层回归并整理规格更新决策

**Files:**

- Modify: `.superwork/spec/` 仅在实现后确认为长期规则变化时更新
- Test: `src/test/**`

- [ ] **Step 1: 跑后端与 worker 相关测试**

Run: `pnpm test:unit -- --run src/test/server src/test/app/api src/test/worker`  
Expected: PASS

- [ ] **Step 2: 跑前端相关测试**

Run: `pnpm test:unit -- --run src/test/features/feeds src/test/features/settings src/test/lib/apiClient.test.ts`  
Expected: PASS

- [ ] **Step 3: 跑静态检查**

Run: `pnpm lint`  
Expected: PASS

- [ ] **Step 4: 跑类型检查**

Run: `pnpm type-check`  
Expected: PASS

- [ ] **Step 5: 视改动范围决定是否补跑全量测试与构建**

Run: `pnpm test:unit`  
Expected: PASS

Run: `pnpm build`  
Expected: PASS，若 API 返回结构和 reader UI 改动已跨层扩散

- [ ] **Step 6: 做 `superwork-update-spec` 决策并提交**

```bash
git add .
git commit -m "feat(fever): 完成Fever服务接入主链路" -m $'- 打通 Fever 同步、投影与双向写回\n- 复用现有阅读器与 AI 增强链路\n- 收紧 Fever 订阅源前端交互边界'
```
