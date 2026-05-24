import { createHash } from 'node:crypto';
import { mapFeverError } from '@/server/integrations/fever/feverErrors';
import {
  parseFeverEnvelope,
  type FeverEnvelope,
  type FeverFeed,
  type FeverItem,
} from '@/server/integrations/fever/feverSchemas';

function buildFeverApiKey(username: string, apiKey: string): string {
  return createHash('md5').update(`${username}:${apiKey}`, 'utf8').digest('hex');
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function buildRequestUrl(baseUrl: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${baseUrl}?api&${query}` : `${baseUrl}?api`;
}

export interface FeverClient {
  listFeeds(): Promise<FeverFeed[]>;
  listItems(sinceId?: string): Promise<FeverItem[]>;
  markItem(input: { itemId: string; as: 'read' | 'unread' | 'saved' | 'unsaved' }): Promise<void>;
}

export function createFeverClient(input: {
  baseUrl: string;
  username: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): FeverClient {
  const fetchImpl = input.fetchImpl ?? fetch;
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const feverApiKey = buildFeverApiKey(input.username, input.apiKey);

  async function request(
    params: URLSearchParams,
    options?: { selectorInQuery?: boolean },
  ): Promise<FeverEnvelope> {
    try {
      const selectorInQuery = options?.selectorInQuery ?? false;
      // Fever 读接口要求查询选择器走 query string，否则部分实现只返回 auth 状态而不返回数据体。
      const requestUrl = selectorInQuery ? buildRequestUrl(baseUrl, params) : `${baseUrl}?api`;
      const body = new URLSearchParams({
        api_key: feverApiKey,
        ...(selectorInQuery ? {} : Object.fromEntries(params)),
      });

      const response = await fetchImpl(requestUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });

      const json = await response.json();
      return parseFeverEnvelope(json);
    } catch (error) {
      throw mapFeverError(error);
    }
  }

  return {
    async listFeeds() {
      const feedsEnvelope = await request(new URLSearchParams({
        feeds: '1',
      }), {
        selectorInQuery: true,
      });
      const groupsEnvelope = await request(new URLSearchParams({
        groups: '1',
      }), {
        selectorInQuery: true,
      });

      const groupNameByFeedId = new Map(
        Object.entries(groupsEnvelope.groupNameByFeedId ?? {}),
      );

      return (feedsEnvelope.feeds ?? []).map((feed) => ({
        ...feed,
        groupName: groupNameByFeedId.get(feed.id) ?? feed.groupName,
      }));
    },
    async listItems(sinceId) {
      const params = new URLSearchParams({ items: '1' });
      if (sinceId) {
        params.set('since_id', sinceId);
      }

      const envelope = await request(params, { selectorInQuery: true });
      return envelope.items ?? [];
    },
    async markItem(markInput) {
      await request(
        new URLSearchParams({
          mark: 'item',
          id: markInput.itemId,
          as: markInput.as,
        }),
        {
          // Fever 多个实现要求 mark 选择器出现在 query string，否则可能只返回 auth 成功而忽略写操作。
          selectorInQuery: true,
        },
      );
    },
  };
}
