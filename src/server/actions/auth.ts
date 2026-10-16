'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyPassword } from '../password';
import { SESSION_COOKIE, SESSION_DAYS, authEnabled, signSession } from '../session';
import type { ActionState } from './shared';

// Freno contra adivinar la clave: 5 intentos fallidos bloquean esa IP por 15 minutos.
const attempts = new Map<string, { count: number; until: number }>();

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!authEnabled()) redirect('/');
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const now = Date.now();
  const a = attempts.get(ip);
  if (a && a.until > now) {
    const mins = Math.ceil((a.until - now) / 60000);
    return { status: 'error', message: `Demasiados intentos. Espera ${mins} min.`, at: now };
  }
  const password = String(fd.get('password') ?? '');
  const ok = password.length > 0 && verifyPassword(password, process.env.APP_PASSWORD_HASH ?? '');
  if (!ok) {
    const count = (a?.count ?? 0) + 1;
    attempts.set(ip, { count, until: count >= 5 ? now + 15 * 60_000 : 0 });
    await new Promise((r) => setTimeout(r, 400));
    return { status: 'error', message: 'Contraseña incorrecta.', at: now };
  }
  attempts.delete(ip);
  (await cookies()).set(SESSION_COOKIE, await signSession(), {
    httpOnly: true,
    // Solo "secure" si la conexión es HTTPS (Vercel). En tu red de casa (http://192.168…) la cookie no llegaría.
    secure: process.env.VERCEL === '1' || h.get('x-forwarded-proto') === 'https',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 3600,
  });
  redirect('/');
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
