/**
 * Sesión firmada en una cookie (JWT HS256 con SESSION_SECRET). Sin base de datos de sesiones:
 * es una app de un solo usuario. Lo usan tanto el proxy como las acciones del servidor.
 */
import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'mf_session';
export const SESSION_DAYS = 30;

export function authEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD_HASH);
}

/** En Vercel (internet) la contraseña es obligatoria; en tu computador es opcional. */
export function authMisconfigured(): string | null {
  const online = process.env.VERCEL === '1' || process.env.REQUIRE_PASSWORD === 'true';
  if (online && !authEnabled()) return 'Falta APP_PASSWORD_HASH: la app está en internet y necesita contraseña.';
  if (authEnabled() && (process.env.SESSION_SECRET ?? '').length < 32) return 'SESSION_SECRET debe tener al menos 32 caracteres.';
  return null;
}

function key() {
  return new TextEncoder().encode(process.env.SESSION_SECRET ?? '');
}

export async function signSession(): Promise<string> {
  return new SignJWT({ sub: 'owner' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    return payload.sub === 'owner';
  } catch {
    return false;
  }
}
