import { Nav } from '@/components/Nav';
import { logoutAction } from '@/server/actions/auth';
import { requireAuth } from '@/server/auth';
import { authEnabled } from '@/server/session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl">
      <Nav authEnabled={authEnabled()} logout={logoutAction} />
      <main className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-10 md:pb-12">{children}</main>
    </div>
  );
}
