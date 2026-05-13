import { redirect } from 'next/navigation';
import LoginPage from '@/features/auth/components/LoginPage';
import { isAuthenticated } from '@/server/domains/auth/services/session';

export default async function LoginRoutePage() {
  if (await isAuthenticated()) {
    redirect('/');
  }

  return <LoginPage />;
}
