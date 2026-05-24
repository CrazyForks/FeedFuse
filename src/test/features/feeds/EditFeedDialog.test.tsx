import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EditFeedDialog from '../../../features/feeds/components/EditFeedDialog';

describe('EditFeedDialog', () => {
  it('disables title and url inputs for fever feeds', () => {
    render(
      <EditFeedDialog
        open
        feed={{
          id: '1',
          kind: 'rss',
          provider: 'fever',
          remoteManaged: true,
          remoteSource: 'fever',
          title: 'Feed',
          url: 'https://example.com/feed',
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
          articleListDisplayMode: 'card',
          fetchStatus: null,
          fetchError: null,
        }}
        categories={[]}
        onOpenChange={() => {}}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('名称')).toBeDisabled();
    expect(screen.getByLabelText('URL')).toBeDisabled();
    expect(screen.getByLabelText('分类')).toBeDisabled();
  });
});
