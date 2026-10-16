import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/server/password';
import { signSession, verifySession } from '@/server/session';

describe('contraseña y sesión', () => {
  it('el hash no lleva "$" (se rompería en .env) y verifica bien', () => {
    const h = hashPassword('una clave larga de prueba');
    expect(h).not.toContain('$');
    expect(verifyPassword('una clave larga de prueba', h)).toBe(true);
    expect(verifyPassword('otra clave', h)).toBe(false);
    expect(verifyPassword('x', 'basura')).toBe(false);
  });

  it('la sesión firmada solo vale con el mismo secreto', async () => {
    process.env.SESSION_SECRET = 'a'.repeat(40);
    const token = await signSession();
    expect(await verifySession(token)).toBe(true);
    process.env.SESSION_SECRET = 'b'.repeat(40);
    expect(await verifySession(token)).toBe(false);
    expect(await verifySession(undefined)).toBe(false);
  });
});
