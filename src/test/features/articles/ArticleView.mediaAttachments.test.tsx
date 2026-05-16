import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleView from '../../../features/articles/components/ArticleView';
import { useAppStore } from '../../../store/appStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { defaultPersistedSettings } from '../../../features/settings/settingsSchema';

type ApiClientModule = typeof import('@/lib/api/apiClient');

const idleTasks = {
  fulltext: { type: 'fulltext' as const, status: 'idle' as const, jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
  ai_summary: { type: 'ai_summary' as const, status: 'idle' as const, jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
  ai_translate: { type: 'ai_translate' as const, status: 'idle' as const, jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
};

vi.mock('@/lib/api/apiClient', async () => {
  const actual = await vi.importActual<ApiClientModule>('@/lib/api/apiClient');
  return {
    ...actual,
    enqueueArticleFulltext: vi.fn(),
    getArticleTasks: vi.fn(),
  };
});

function setupResizeObserverMock() {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal('ResizeObserver', MockResizeObserver as unknown as typeof ResizeObserver);
}

async function renderWithAttachment(mimeType: string, url: string) {
  setupResizeObserverMock();
  const apiClient = await import('@/lib/api/apiClient');
  vi.mocked(apiClient.getArticleTasks).mockResolvedValue(idleTasks);

  useSettingsStore.setState((state) => ({
    ...state,
    persistedSettings: {
      ...structuredClone(defaultPersistedSettings),
      general: {
        ...structuredClone(defaultPersistedSettings.general),
        autoMarkReadEnabled: false,
        autoMarkReadDelayMs: 0,
      },
    },
  }));

  useAppStore.setState({
    feeds: [
      {
        id: 'feed-1',
        kind: 'rss',
        title: 'Podcast',
        url: 'https://pod.example.com/rss.xml',
        unreadCount: 0,
        enabled: true,
        fullTextOnOpenEnabled: false,
        fullTextOnFetchEnabled: false,
        aiSummaryOnOpenEnabled: false,
        aiSummaryOnFetchEnabled: false,
        bodyTranslateOnFetchEnabled: false,
        bodyTranslateOnOpenEnabled: false,
        titleTranslateEnabled: false,
        bodyTranslateEnabled: false,
        articleListDisplayMode: 'list',
        fetchStatus: null,
        fetchError: null,
      },
    ],
    articles: [
      {
        id: 'article-1',
        feedId: 'feed-1',
        title: 'Episode 1',
        content: '<p>Episode notes</p>',
        summary: 'summary',
        publishedAt: '2026-05-16T00:00:00.000Z',
        link: 'https://pod.example.com/1',
        isRead: true,
        isStarred: false,
        mediaAttachments: [
          {
            id: 'attachment-1',
            url,
            mimeType,
            sizeBytes: 123,
            durationSeconds: 456,
          },
        ],
      },
    ],
    selectedView: 'all',
    selectedArticleId: 'article-1',
    refreshArticle: vi.fn(),
  });

  render(<ArticleView />);
  await act(async () => {
    await Promise.resolve();
  });
}

describe('ArticleView media attachments', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    useAppStore.setState({ articles: [], feeds: [], selectedArticleId: null });
  });

  it('renders an audio player for audio podcast attachments', async () => {
    await renderWithAttachment('audio/mpeg', 'https://pod.example.com/1.mp3');

    const player = screen.getByTestId('article-media-player');
    expect(player.tagName.toLowerCase()).toBe('audio');
    expect(player).toHaveAttribute('controls');
    expect(player).toHaveAttribute('preload', 'metadata');
    expect(player).toHaveAttribute('src', 'https://pod.example.com/1.mp3');
    expect(screen.queryByRole('button', { name: '抓取全文' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '翻译' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '生成摘要' })).not.toBeInTheDocument();
  });

  it('renders a video player for video podcast attachments', async () => {
    await renderWithAttachment('video/mp4', 'https://pod.example.com/1.mp4');

    const player = screen.getByTestId('article-media-player');
    expect(player.tagName.toLowerCase()).toBe('video');
    expect(player).toHaveAttribute('controls');
    expect(player).toHaveAttribute('preload', 'metadata');
    expect(player).toHaveAttribute('src', 'https://pod.example.com/1.mp4');
  });
});
