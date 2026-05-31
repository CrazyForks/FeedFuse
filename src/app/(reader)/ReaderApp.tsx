'use client';

import ReaderLayout from '../../features/reader/components/ReaderLayout';
import { ToastHost } from '../../features/toast/components/ToastHost';
import { useTheme } from '../../hooks';
import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/appStore';
import { useSettingsStore } from '../../store/settingsStore';
import { getCurrentUser } from '../../lib/api/apiClient';
import { useAuthStore } from '../../store/authStore';
import type { ViewType } from '../../types';

const AUTO_SNAPSHOT_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

interface ReaderAppProps {
  renderedAt?: string;
  initialSelectedView?: ViewType;
}

export default function ReaderApp({ renderedAt, initialSelectedView }: ReaderAppProps) {
  useTheme();
  const selectedView = useAppStore((state) => state.selectedView);
  const loadSnapshot = useAppStore((state) => state.loadSnapshot);
  const rehydrateUserScopedLocalState = useAppStore((state) => state.rehydrateUserScopedLocalState);
  const hydratePersistedSettings = useSettingsStore((state) => state.hydratePersistedSettings);
  const setCurrentUser = useAuthStore((state) => state.setCurrentUser);
  const lastAutoSnapshotAtRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const user = await getCurrentUser({ notifyOnError: false });
        if (cancelled) return;
        setCurrentUser(user);
      } catch {
        if (cancelled) return;
        setCurrentUser(null);
        await hydratePersistedSettings();
        return;
      }

      // 用户确定后再读取本地缓存，避免先落到 anonymous 命名空间。
      await useSettingsStore.persist.rehydrate();
      rehydrateUserScopedLocalState();
      await hydratePersistedSettings();
    })();

    return () => {
      cancelled = true;
    };
  }, [hydratePersistedSettings, rehydrateUserScopedLocalState, setCurrentUser]);

  useEffect(() => {
    void loadSnapshot({ view: selectedView });
  }, [loadSnapshot, selectedView]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      const now = Date.now();
      if (
        lastAutoSnapshotAtRef.current !== null &&
        now - lastAutoSnapshotAtRef.current < AUTO_SNAPSHOT_REFRESH_INTERVAL_MS
      ) {
        return;
      }

      lastAutoSnapshotAtRef.current = now;
      const { selectedView: currentView, loadSnapshot: reloadSnapshot } = useAppStore.getState();
      void reloadSnapshot({ view: currentView });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <>
      <ReaderLayout renderedAt={renderedAt} initialSelectedView={initialSelectedView} />
      <ToastHost />
    </>
  );
}
