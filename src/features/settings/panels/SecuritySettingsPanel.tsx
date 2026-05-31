'use client';

import { useEffect, useState, useTransition } from 'react';
import { Shield, UserPlus } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ApiError,
  changeOwnPassword,
  createUser,
  listUsers,
  logout,
  updateUser,
  type CurrentUser,
  type CurrentUserRole,
} from '@/lib/api/apiClient';
import { useAuthStore } from '@/store/authStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import SettingTooltipLabel from '../components/SettingTooltipLabel';

export default function SecuritySettingsPanel() {
  const currentPasswordLabelId = 'settings-current-password-label';
  const nextPasswordLabelId = 'settings-next-password-label';
  const confirmPasswordLabelId = 'settings-confirm-password-label';
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securityMessage, setSecurityMessage] = useState('');
  const [isSecurityError, setIsSecurityError] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [users, setUsers] = useState<CurrentUser[]>([]);
  const [usersMessage, setUsersMessage] = useState('');
  const [isUsersError, setIsUsersError] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<CurrentUserRole>('member');
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({});
  const [isPasswordPending, startPasswordTransition] = useTransition();
  const [isLogoutPending, startLogoutTransition] = useTransition();
  const [isUsersPending, startUsersTransition] = useTransition();
  const currentUser = useAuthStore((state) => state.currentUser);
  const setCurrentUser = useAuthStore((state) => state.setCurrentUser);
  const clearCurrentUser = useAuthStore((state) => state.clearCurrentUser);

  const loadUsers = () => {
    if (currentUser?.role !== 'admin') return;

    startUsersTransition(() => {
      void listUsers({ notifyOnError: false })
        .then((items) => {
          setUsers(items);
          setIsUsersError(false);
        })
        .catch((err) => {
          setIsUsersError(true);
          setUsersMessage(err instanceof ApiError ? err.message : '加载用户失败');
        });
    });
  };

  useEffect(() => {
    loadUsers();
    // 只在当前用户身份变化时刷新用户列表。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.role]);

  const resetSecurityForm = () => {
    setCurrentPassword('');
    setNextPassword('');
    setConfirmPassword('');
  };

  const submitPasswordChange = () => {
    setSecurityMessage('');
    setIsSecurityError(false);

    if (!currentPassword.trim()) {
      setIsSecurityError(true);
      setSecurityMessage('请输入当前密码');
      return;
    }

    if (nextPassword.trim().length < 8) {
      setIsSecurityError(true);
      setSecurityMessage('新密码至少需要 8 位');
      return;
    }

    if (nextPassword !== confirmPassword) {
      setIsSecurityError(true);
      setSecurityMessage('两次输入的新密码不一致');
      return;
    }

    startPasswordTransition(() => {
      void (async () => {
        try {
          await changeOwnPassword(
            {
              currentPassword,
              nextPassword,
            },
            { notifyOnError: false, redirectOnUnauthorized: false },
          );
          resetSecurityForm();
          setIsSecurityError(false);
          setSecurityMessage('密码已更新');
        } catch (err) {
          setIsSecurityError(true);
          if (err instanceof ApiError) {
            setSecurityMessage(err.message);
            return;
          }

          setSecurityMessage('修改密码失败，请稍后重试');
        }
      })();
    });
  };

  const handleLogout = () => {
    setSecurityMessage('');

    startLogoutTransition(() => {
      void (async () => {
        try {
          await logout({ notifyOnError: false, redirectOnUnauthorized: false });
        } finally {
          clearCurrentUser();
          window.location.assign('/login');
        }
      })();
    });
  };

  const submitCreateUser = () => {
    setUsersMessage('');
    setIsUsersError(false);

    if (!newUsername.trim() || newPassword.trim().length < 8) {
      setIsUsersError(true);
      setUsersMessage('请输入用户名和至少 8 位密码');
      return;
    }

    startUsersTransition(() => {
      void createUser(
        { username: newUsername.trim(), password: newPassword, role: newRole },
        { notifyOnError: false },
      )
        .then((created) => {
          setUsers((items) => [...items, created]);
          setNewUsername('');
          setNewPassword('');
          setNewRole('member');
          setUsersMessage('用户已创建');
        })
        .catch((err) => {
          setIsUsersError(true);
          setUsersMessage(err instanceof ApiError ? err.message : '创建用户失败');
        });
    });
  };

  const submitUserPatch = (
    user: CurrentUser,
    patch: { status?: 'active' | 'disabled'; password?: string },
  ) => {
    setUsersMessage('');
    setIsUsersError(false);

    startUsersTransition(() => {
      void updateUser(user.id, patch, { notifyOnError: false })
        .then((updated) => {
          setUsers((items) => items.map((item) => (item.id === updated.id ? updated : item)));
          if (updated.id === currentUser?.id) {
            setCurrentUser({ ...currentUser, ...updated });
          }
          setResetPasswords((items) => ({ ...items, [user.id]: '' }));
          setUsersMessage('用户已更新');
        })
        .catch((err) => {
          setIsUsersError(true);
          setUsersMessage(err instanceof ApiError ? err.message : '更新用户失败');
        });
    });
  };

  return (
    <>
      <section className="space-y-5">
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <SettingTooltipLabel
                label="当前账号"
                description="当前登录用户和权限。"
                className="text-sm font-medium text-foreground"
              />
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{currentUser?.username ?? 'admin'}</span>
                <Badge variant="secondary">{currentUser?.role === 'admin' ? '管理员' : '成员'}</Badge>
              </div>
            </div>
            <Shield className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <div className="space-y-1">
            <SettingTooltipLabel
              label="修改密码"
              description="更新后会立即刷新当前登录会话。"
              className="text-sm font-medium text-foreground"
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label id={currentPasswordLabelId}>当前密码</Label>
              <Input
                id="settings-current-password"
                type="password"
                autoComplete="current-password"
                aria-labelledby={currentPasswordLabelId}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="输入当前密码"
              />
            </div>
            <div className="space-y-2">
              <Label id={nextPasswordLabelId}>新密码</Label>
              <Input
                id="settings-next-password"
                type="password"
                autoComplete="new-password"
                aria-labelledby={nextPasswordLabelId}
                value={nextPassword}
                onChange={(event) => setNextPassword(event.target.value)}
                placeholder="至少 8 位"
              />
            </div>
            <div className="space-y-2">
              <Label id={confirmPasswordLabelId}>确认新密码</Label>
              <Input
                id="settings-confirm-password"
                type="password"
                autoComplete="new-password"
                aria-labelledby={confirmPasswordLabelId}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再次输入新密码"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            {securityMessage ? (
              <p className={isSecurityError ? 'text-sm text-red-600' : 'text-sm text-muted-foreground'}>
                {securityMessage}
              </p>
            ) : null}
            <Button
              type="button"
              onClick={submitPasswordChange}
              disabled={isPasswordPending}
            >
              {isPasswordPending ? '更新中…' : '更新密码'}
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          {/* 将退出登录独立为单独模块，避免与修改密码操作混淆。 */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <SettingTooltipLabel
                label="退出登录"
                description="退出后将返回登录页面。"
                className="text-sm font-medium text-foreground"
              />
            </div>
            <Button
              type="button"
              variant="destructive"
              size="compact"
              onClick={() => {
                // 危险操作先二次确认，确认后再真正调用退出接口。
                setLogoutConfirmOpen(true);
              }}
              disabled={isLogoutPending}
            >
              {isLogoutPending ? '退出中…' : '退出登录'}
            </Button>
          </div>
        </div>

        {currentUser?.role === 'admin' ? (
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="space-y-1">
              <SettingTooltipLabel
                label="用户管理"
                description="管理员可创建账号、重置密码、禁用或启用账号。"
                className="text-sm font-medium text-foreground"
              />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_160px_auto]">
              <Input
                value={newUsername}
                onChange={(event) => setNewUsername(event.target.value)}
                placeholder="用户名"
                autoComplete="off"
              />
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="初始密码"
                autoComplete="new-password"
              />
              <Select value={newRole} onValueChange={(value) => setNewRole(value as CurrentUserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">成员</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" onClick={submitCreateUser} disabled={isUsersPending}>
                <UserPlus className="mr-2 h-4 w-4" />
                创建
              </Button>
            </div>

            <div className="mt-4 divide-y divide-border rounded-md border border-border">
              {users.map((user) => {
                const disabled = user.status === 'disabled';
                return (
                  <div
                    key={user.id}
                    className="grid gap-3 p-3 lg:grid-cols-[1fr_100px_100px_1fr_auto_auto]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{user.username ?? `#${user.id}`}</p>
                      <p className="text-xs text-muted-foreground">ID {user.id}</p>
                    </div>
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                      {user.role === 'admin' ? '管理员' : '成员'}
                    </Badge>
                    <Badge variant={disabled ? 'destructive' : 'outline'}>
                      {disabled ? '已禁用' : '启用中'}
                    </Badge>
                    <Input
                      type="password"
                      value={resetPasswords[user.id] ?? ''}
                      onChange={(event) =>
                        setResetPasswords((items) => ({
                          ...items,
                          [user.id]: event.target.value,
                        }))
                      }
                      placeholder="新密码"
                      autoComplete="new-password"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      disabled={isUsersPending || !(resetPasswords[user.id] ?? '').trim()}
                      onClick={() => submitUserPatch(user, { password: resetPasswords[user.id] })}
                    >
                      重置
                    </Button>
                    <Button
                      type="button"
                      variant={disabled ? 'secondary' : 'destructive'}
                      size="compact"
                      disabled={isUsersPending || user.id === currentUser.id}
                      onClick={() =>
                        submitUserPatch(user, { status: disabled ? 'active' : 'disabled' })
                      }
                    >
                      {disabled ? '启用' : '禁用'}
                    </Button>
                  </div>
                );
              })}
            </div>

            {usersMessage ? (
              <p className={isUsersError ? 'mt-3 text-sm text-red-600' : 'mt-3 text-sm text-muted-foreground'}>
                {usersMessage}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <AlertDialog
        open={logoutConfirmOpen}
        onOpenChange={(open) => {
          if (isLogoutPending) {
            return;
          }
          setLogoutConfirmOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认退出登录</AlertDialogTitle>
            <AlertDialogDescription>
              退出后将结束当前会话，并返回登录页面。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLogoutPending}>取消</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={isLogoutPending}
              onClick={() => {
                setLogoutConfirmOpen(false);
                handleLogout();
              }}
            >
              {isLogoutPending ? '退出中…' : '确认退出'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
