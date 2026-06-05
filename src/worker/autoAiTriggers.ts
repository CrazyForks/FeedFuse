import type { PgBoss } from 'pg-boss';
import { evaluateArticleBodyTranslationEligibility } from '@/server/integrations/ai/articleTranslationEligibility';
import { getQueueSendOptions } from '@/server/infra/queue/contracts';
import { JOB_AI_SUMMARIZE, JOB_AI_TRANSLATE } from '@/server/infra/queue/jobs';

interface FeedAutoAiTriggerFlags {
  aiSummaryOnFetchEnabled: boolean;
  bodyTranslateOnFetchEnabled: boolean;
}

interface CreatedArticleForAutoAi {
  id: string;
  aiSummary: string | null;
  aiTranslationBilingualHtml: string | null;
  aiTranslationZhHtml: string | null;
  sourceLanguage?: string | null;
  contentHtml?: string | null;
  contentFullHtml?: string | null;
  summary?: string | null;
}

export async function enqueueAutoAiTriggersOnFetch(
  boss: Pick<PgBoss, 'send'>,
  input: {
    userId?: string | null;
    feed: FeedAutoAiTriggerFlags;
    created: CreatedArticleForAutoAi | null;
  },
): Promise<void> {
  const { feed, created } = input;
  if (!created) return;

  if (feed.aiSummaryOnFetchEnabled === true && !created.aiSummary?.trim()) {
    await boss.send(
      JOB_AI_SUMMARIZE,
      { articleId: created.id, ...(input.userId ? { userId: input.userId } : {}) },
      getQueueSendOptions(JOB_AI_SUMMARIZE, {
        articleId: created.id,
        ...(input.userId ? { userId: input.userId } : {}),
      }),
    );
  }

  if (
    feed.bodyTranslateOnFetchEnabled === true &&
    !(created.aiTranslationBilingualHtml?.trim() || created.aiTranslationZhHtml?.trim())
  ) {
    const eligibility = evaluateArticleBodyTranslationEligibility({
      sourceLanguage: created.sourceLanguage ?? null,
      contentHtml: created.contentHtml ?? null,
      contentFullHtml: created.contentFullHtml ?? null,
      summary: created.summary ?? null,
    });
    if (!eligibility.bodyTranslationEligible) {
      return;
    }

    await boss.send(
      JOB_AI_TRANSLATE,
      { articleId: created.id, ...(input.userId ? { userId: input.userId } : {}) },
      getQueueSendOptions(JOB_AI_TRANSLATE, {
        articleId: created.id,
        ...(input.userId ? { userId: input.userId } : {}),
      }),
    );
  }
}
