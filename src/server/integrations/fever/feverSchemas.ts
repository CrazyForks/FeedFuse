import { z } from 'zod';
import { FeverAuthError, FeverProtocolError } from '@/server/integrations/fever/feverErrors';

const feverFeedSchema = z.object({
  id: z.coerce.string(),
  title: z.string().catch(''),
  url: z.string().catch(''),
  site_url: z.string().nullish(),
  favicon_id: z.union([z.string(), z.number()]).nullish(),
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
  items: z.array(feverItemSchema).optional(),
});

function parseFlag(value: string | number | boolean | null | undefined): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true';
  return false;
}

export interface FeverFeed {
  id: string;
  title: string;
  url: string;
  siteUrl: string | null;
  faviconId: string | null;
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

  return {
    apiVersion:
      typeof parsed.data.api_version === 'undefined' ? null : String(parsed.data.api_version),
    auth,
    feeds: parsed.data.feeds?.map((feed) => ({
      id: feed.id,
      title: feed.title,
      url: feed.url,
      siteUrl: feed.site_url ?? null,
      faviconId:
        typeof feed.favicon_id === 'undefined' || feed.favicon_id === null
          ? null
          : String(feed.favicon_id),
    })),
    items: parsed.data.items?.map((item) => ({
      id: item.id,
      feedId: item.feed_id,
      title: item.title,
      author: item.author ?? null,
      html: item.html ?? null,
      url: item.url ?? null,
      createdAt:
        typeof item.created_on_time === 'undefined' || item.created_on_time === null
          ? null
          : String(item.created_on_time),
      isRead: parseFlag(item.is_read),
      isSaved: parseFlag(item.is_saved),
    })),
  };
}
