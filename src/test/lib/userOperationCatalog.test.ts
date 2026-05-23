import { describe, expect, it } from 'vitest';
import {
  getUserOperationCatalogEntry,
  renderUserOperationFailure,
  renderUserOperationSuccess,
  shouldEmitUserOperationToast,
} from '@/lib/userOperationCatalog';

describe('userOperationCatalog', () => {
  it('renders success without reason and error with short reason', () => {
    expect(renderUserOperationSuccess('feed.create')).toBe('已添加订阅源');
    expect(renderUserOperationSuccess('fever.sync', { outcome: 'deleted' })).toBe('已删除 Fever 服务和其源');
    expect(renderUserOperationSuccess('fever.sync', { outcome: 'settings_saved' })).toBe('已保存 Fever 账号设置');
    expect(renderUserOperationFailure('feed.create', '  订阅源已存在  ')).toBe(
      '添加订阅源失败：订阅源已存在',
    );
  });

  it('exposes mode, category and start message for deferred actions', () => {
    expect(getUserOperationCatalogEntry('feed.refresh')).toMatchObject({
      mode: 'deferred',
      category: 'feed',
    });
  });

  it('allows low-signal actions to opt out of toast stages', () => {
    expect(shouldEmitUserOperationToast('feed.refresh', 'started')).toBe(true);
    expect(shouldEmitUserOperationToast('feed.articleListDisplayMode.update', 'success')).toBe(
      false,
    );
    expect(shouldEmitUserOperationToast('article.aiSummary.generate', 'started')).toBe(false);
    expect(shouldEmitUserOperationToast('article.aiSummary.generate', 'error')).toBe(false);
    expect(shouldEmitUserOperationToast('settings.save', 'error')).toBe(false);
  });
});
