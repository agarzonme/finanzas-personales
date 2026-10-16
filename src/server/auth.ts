import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppError } from './errors';
import { SESSION_COOKIE, authEnabled, authMisconfigured, verifySession } from './session';

/**
 * Verifica la sesión. Se llama en cada página y en cada acción del servidor
 * (el proxy es solo la primera barrera). Leer las cookies también hace que la
 * página se genere en cada visita, con datos frescos.
 */
export async function requireAuth(opts: { redirectToLogin?: boolean } = { redirectToLogin: true }) {
  const store = await cookies();
  const problem = authMisconfigured();
  if (problem) throw new AppError(problem);
  if (!authEnabled()) return;
  if (await verifySession(store.get(SESSION_COOKIE)?.value)) return;
  if (opts.redirectToLogin) redirect('/login');
  throw new AppError('Tu sesión expiró. Vuelve a entrar.');
}
