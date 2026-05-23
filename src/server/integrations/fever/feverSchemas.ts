import { z } from 'zod';
import { FeverAuthError, FeverProtocolError } from '@/server/integrations/fever/feverErrors';

const feverFeedSchema = z.object({
  id: z.coerce.string(),
  title: z.string().catch(''),
  url: z.string().catch(''),
  site_url: z.string().nullish(),
  favicon_id: z.union([z.string(), z.number()]).nullish(),
});

const feverGroupSchema = z.object({
  id: z.coerce.string(),
  title: z.string().catch(''),
});

const feverFeedsGroupSchema = z.object({
  group_id: z.coerce.string(),
  feed_ids: z.string().catch(''),
});

const feverItemSchema = z.object({
  id: z.coerce.string(),
  feed_id: z.coerce.string(),
  title: z.string().catch(''),
  author: z.string().nullish(),
  html: z.string().nullish(),
  url: z.string().nullish(),
  created_on_time: z.union([z.string(), z.number()]).nullish(),
  is_read: z.union([z.string(), z.number(), z.boolean()]).nullish(),
  is_saved: z.union([z.string(), z.number(), z.boolean()]).nullish(),
});

const feverEnvelopeBaseSchema = z.object({
  api_version: z.union([z.number(), z.string()]).optional(),
  auth: z.union([z.number(), z.string(), z.boolean()]).optional(),
  feeds: z.array(feverFeedSchema).optional(),
  groups: z.array(feverGroupSchema).optional(),
  feeds_groups: z.array(feverFeedsGroupSchema).optional(),
  items: z.array(feverItemSchema).optional(),
});

function parseFlag(value: string | number | boolean | null | undefined): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true';
  return false;
}

function normalizeFeverCreatedAt(
  value: string | number | null | undefined,
): string | null {
  if (typeof value === 'undefined' || value === null) {
    return null;
  }

  // Fever `created_on_time` 使用 Unix 秒级时间戳，入库前统一转成 ISO 字符串。
  if (typeof value === 'number' || /^\d+$/.test(value)) {
    const timestamp = typeof value === 'number' ? value : Number(value);
    const date = new Date(timestamp * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return value;
}

export interface FeverFeed {
  id: string;
  title: string;
  url: string;
  siteUrl: string | null;
  faviconId: string | null;
  groupName: string | null;
}

export interface FeverItem {
  id: string;
  feedId: string;
  title: string;
  author: string | null;
  html: string | null;
  url: string | null;
  createdAt: string | null;
  isRead: boolean;
  isSaved: boolean;
}

export interface FeverEnvelope {
  apiVersion: string | null;
  auth: boolean;
  feeds?: FeverFeed[];
  items?: FeverItem[];
  groupNameByFeedId?: Record<string, string>;
}

export function parseFeverEnvelope(input: unknown): FeverEnvelope {
  const parsed = feverEnvelopeBaseSchema.safeParse(input);
  if (!parsed.success) {
    throw new FeverProtocolError();
  }

  const auth = parseFlag(parsed.data.auth);
  if (!auth) {
    throw new FeverAuthError();
  }

  const groupNameByFeedId = new Map<string, string>();
  const groupTitleById = new Map(
    (parsed.data.groups ?? []).map((group) => [group.id, group.title]),
  );

  for (const feedsGroup of parsed.data.feeds_groups ?? []) {
    const groupTitle = groupTitleById.get(feedsGroup.group_id)?.trim();
    if (!groupTitle) {
      continue;
    }

    for (const rawFeedId of feedsGroup.feed_ids.split(',')) {
      const feedId = rawFeedId.trim();
      if (!feedId || groupNameByFeedId.has(feedId)) {
        continue;
      }

      groupNameByFeedId.set(feedId, groupTitle);
    }
  }

  return {
    apiVersion:
      typeof parsed.data.api_version === 'undefined' ? null : String(parsed.data.api_version),
    auth,
    groupNameByFeedId: Object.fromEntries(groupNameByFeedId),
    feeds: parsed.data.feeds?.map((feed) => ({
      id: feed.id,
      title: feed.title,
      url: feed.url,
      siteUrl: feed.site_url ?? null,
      faviconId:
        typeof feed.favicon_id === 'undefined' || feed.favicon_id === null
          ? null
          : String(feed.favicon_id),
      groupName: groupNameByFeedId.get(feed.id) ?? null,
    })),
    items: parsed.data.items?.map((item) => ({
      id: item.id,
      feedId: item.feed_id,
      title: item.title,
      author: item.author ?? null,
      html: item.html ?? null,
      url: item.url ?? null,
      createdAt: normalizeFeverCreatedAt(item.created_on_time),
      isRead: parseFlag(item.is_read),
      isSaved: parseFlag(item.is_saved),
    })),
  };
}
