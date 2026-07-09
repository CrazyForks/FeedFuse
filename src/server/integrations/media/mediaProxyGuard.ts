import { getExternalUrlSafety } from '@/server/integrations/rss/ssrfGuard';

export async function isSafeMediaUrl(value: string): Promise<boolean> {
  // 媒体 URL 和 RSS 源共用同一套网络模式，避免两套白名单规则漂移。
  return (await getExternalUrlSafety(value)).safe;
}
