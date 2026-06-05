import type { PublicUserRow, UserRow } from '@/server/domains/auth/repositories/usersRepo';

export const INITIAL_USER_ID = '1';

export function isInitialUser(
  user: Pick<UserRow, 'id'> | Pick<PublicUserRow, 'id'> | null | undefined,
): boolean {
  return user?.id === INITIAL_USER_ID;
}
