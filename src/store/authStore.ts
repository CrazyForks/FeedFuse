import { create } from 'zustand';
import type { CurrentUser } from '@/lib/api/apiClient';

interface AuthState {
  currentUser: CurrentUser | null;
  setCurrentUser: (user: CurrentUser | null) => void;
  clearCurrentUser: () => void;
}

export const AUTH_ANONYMOUS_STORAGE_USER_ID = 'anonymous';

export function getCurrentStorageUserId(): string {
  return useAuthStore.getState().currentUser?.id ?? AUTH_ANONYMOUS_STORAGE_USER_ID;
}

export const useAuthStore = create<AuthState>()((set) => ({
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),
  clearCurrentUser: () => set({ currentUser: null }),
}));
