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

  async function request(params: URLSearchParams): Promise<FeverEnvelope> {
    try {
      const body = new URLSearchParams({
        api_key: feverApiKey,
        ...Object.fromEntries(params),
      });

      const response = await fetchImpl(`${baseUrl}/?api`, {
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
      const envelope = await request(new URLSearchParams({ feeds: '1' }));
      return envelope.feeds ?? [];
    },
    async listItems(sinceId) {
      const params = new URLSearchParams({ items: '1' });
      if (sinceId) {
        params.set('since_id', sinceId);
      }

      const envelope = await request(params);
      return envelope.items ?? [];
    },
    async markItem(markInput) {
      await request(
        new URLSearchParams({
          mark: 'item',
          id: markInput.itemId,
          as: markInput.as,
        }),
      );
    },
  };
}
