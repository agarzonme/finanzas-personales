/**
 * Genera las dos variables de acceso para publicar la app en internet.
 * Uso:  npm run hash-password -- "una-clave-larga-que-no-uses-en-otro-lado"
 */
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../src/server/password';

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error('Escribe una contraseña de al menos 10 caracteres:  npm run hash-password -- "mi clave larga"');
  process.exit(1);
}
console.log('\nCopia estas dos líneas en tu .env (o en las variables de entorno de Vercel):\n');
console.log(`APP_PASSWORD_HASH=${hashPassword(password)}`);
console.log(`SESSION_SECRET=${randomBytes(48).toString('base64url')}\n`);
