export const DEFAULT_ADMIN_USER_ID = '1';

// 兼容旧单用户调用点；新 API/任务必须显式传当前 session.userId。
export function normalizeUserId(userId?: string | null): string {
  return userId ?? DEFAULT_ADMIN_USER_ID;
}
