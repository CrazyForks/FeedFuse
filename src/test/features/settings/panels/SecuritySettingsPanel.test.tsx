import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SecuritySettingsPanel from '../../../../features/settings/panels/SecuritySettingsPanel';
import { useAuthStore } from '../../../../store/authStore';

const changeOwnPasswordMock = vi.hoisted(() => vi.fn());
const createUserMock = vi.hoisted(() => vi.fn());
const deleteUserMock = vi.hoisted(() => vi.fn());
const listUsersMock = vi.hoisted(() => vi.fn());
const logoutMock = vi.hoisted(() => vi.fn());
const updateUserMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/apiClient')>('@/lib/api/apiClient');
  return {
    ...actual,
    changeOwnPassword: (...args: unknown[]) => changeOwnPasswordMock(...args),
    createUser: (...args: unknown[]) => createUserMock(...args),
    deleteUser: (...args: unknown[]) => deleteUserMock(...args),
    listUsers: (...args: unknown[]) => listUsersMock(...args),
    logout: (...args: unknown[]) => logoutMock(...args),
    updateUser: (...args: unknown[]) => updateUserMock(...args),
  };
});

describe('SecuritySettingsPanel', () => {
  beforeEach(() => {
    changeOwnPasswordMock.mockReset().mockResolvedValue({ updated: true });
    createUserMock.mockReset().mockResolvedValue({
      id: '3',
      username: 'new-user',
      role: 'member',
      status: 'active',
      sessionVersion: 1,
    });
    deleteUserMock.mockReset().mockResolvedValue({ deleted: true });
    listUsersMock.mockReset().mockResolvedValue([
      { id: '1', username: 'admin', role: 'admin', status: 'active', sessionVersion: 1 },
      { id: '2', username: 'member', role: 'member', status: 'active', sessionVersion: 1 },
    ]);
    logoutMock.mockReset().mockResolvedValue({ authenticated: false });
    updateUserMock.mockReset().mockImplementation(async (_userId: string, input: Record<string, unknown>) => ({
      id: '2',
      username: String(input.username ?? 'member'),
      role: (input.role as 'admin' | 'member' | undefined) ?? 'member',
      status: (input.status as 'active' | 'disabled' | undefined) ?? 'active',
      sessionVersion: 2,
    }));
    useAuthStore.setState({
      currentUser: {
        id: '1',
        username: 'admin',
        role: 'admin',
        status: 'active',
        sessionVersion: 1,
      },
    });
  });

  it('opens current account dialog for password changes only', async () => {
    render(<SecuritySettingsPanel />);

    expect(screen.queryByLabelText('当前密码')).not.toBeInTheDocument();
    expect(screen.queryByText('左侧展示当前登录用户信息，资料修改和密码修改统一在弹窗中完成。')).not.toBeInTheDocument();
    expect(screen.queryByText(/^ID /)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('security-current-user-edit-button'));

    const dialog = await screen.findByRole('dialog', { name: '编辑当前账号' });
    expect(within(dialog).getByLabelText('当前密码')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('新密码')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('确认新密码')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('用户名')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('当前账号资料只展示在这里，所有用户都可在此修改自己的密码。')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('ID 1')).not.toBeInTheDocument();
  });

  it('hides initial admin from user table and opens user edit dialog for other users', async () => {
    render(<SecuritySettingsPanel />);

    expect(await screen.findByText('member')).toBeInTheDocument();
    expect(screen.queryByTestId('security-user-edit-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('security-user-delete-2')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('新密码')).not.toBeInTheDocument();
    expect(screen.queryAllByText('admin')).toHaveLength(1);
    expect(screen.queryByText('表格仅展示账号信息，点击编辑后在弹窗中修改用户资料。')).not.toBeInTheDocument();
    expect(screen.queryByText('表格外只展示用户信息，新增和编辑统一通过弹窗处理。')).not.toBeInTheDocument();
    expect(screen.queryByText(/^1$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^2$/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('security-user-edit-2'));

    const dialog = await screen.findByRole('dialog', { name: '编辑用户' });
    expect(within(dialog).getByLabelText('用户名')).toHaveValue('member');
    expect(within(dialog).getByLabelText('角色')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('状态')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('新密码')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('所有新增和编辑用户信息都在弹窗中完成，面板外只保留信息展示。')).not.toBeInTheDocument();
  });

  it('shows delete action only for initial admin and deletes non-initial users through confirm dialog', async () => {
    render(<SecuritySettingsPanel />);

    fireEvent.click(await screen.findByTestId('security-user-delete-2'));

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(deleteUserMock).toHaveBeenCalledWith('2', { notifyOnError: false });
    });
    await waitFor(() => {
      expect(screen.queryByText('member')).not.toBeInTheDocument();
    });
  });

  it('hides delete action for non-initial admin users', async () => {
    useAuthStore.setState({
      currentUser: {
        id: '3',
        username: 'ops-admin',
        role: 'admin',
        status: 'active',
        sessionVersion: 1,
      },
    });

    render(<SecuritySettingsPanel />);

    expect(await screen.findByText('member')).toBeInTheDocument();
    expect(screen.queryByTestId('security-user-delete-2')).not.toBeInTheDocument();
  });

  it('shows empty state when user management has no managed users', async () => {
    listUsersMock.mockResolvedValue([
      { id: '1', username: 'admin', role: 'admin', status: 'active', sessionVersion: 1 },
    ]);

    render(<SecuritySettingsPanel />);

    expect(await screen.findByText('暂无用户')).toBeInTheDocument();
    expect(screen.queryByTestId('security-user-edit-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('security-user-delete-2')).not.toBeInTheDocument();
  });

  it('opens create user dialog and submits through createUser', async () => {
    render(<SecuritySettingsPanel />);

    fireEvent.click(await screen.findByTestId('security-create-user-button'));

    const dialog = await screen.findByRole('dialog', { name: '新增用户' });
    const fields = within(dialog).getAllByText(/^(用户名|新密码|角色|状态)$/);
    expect(fields.map((field) => field.textContent)).toEqual(['用户名', '新密码', '角色', '状态']);
    fireEvent.change(within(dialog).getByLabelText('用户名'), { target: { value: 'new-user' } });
    fireEvent.change(within(dialog).getByLabelText('新密码'), { target: { value: 'password-123' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(createUserMock).toHaveBeenCalledWith(
        { username: 'new-user', password: 'password-123', role: 'member' },
        { notifyOnError: false },
      );
    });
  });

  it('submits user edits through updateUser dialog', async () => {
    render(<SecuritySettingsPanel />);

    fireEvent.click(await screen.findByTestId('security-user-edit-2'));

    const dialog = await screen.findByRole('dialog', { name: '编辑用户' });
    fireEvent.change(within(dialog).getByLabelText('用户名'), { target: { value: 'member-next' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(updateUserMock).toHaveBeenCalledWith(
        '2',
        {
          username: 'member-next',
          role: 'member',
          status: 'active',
        },
        { notifyOnError: false },
      );
    });
  });
});
