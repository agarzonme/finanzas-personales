import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// scrypt: función de derivación lenta a propósito, para que adivinar la clave sea costoso.
// Formato "scrypt.<sal>.<hash>": sin el signo $, que Next y la terminal interpretarían como variable.
const N = 2 ** 15;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N, r: 8, p: 1, maxmem: MAXMEM });
  return `scrypt.${salt.toString('base64url')}.${hash.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.trim().split('.');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64url'), expected.length, { N, r: 8, p: 1, maxmem: MAXMEM });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
