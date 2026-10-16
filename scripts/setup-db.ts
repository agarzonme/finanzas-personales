/**
 * Prepara la base de datos: aplica migraciones pendientes y carga los datos iniciales
 * si está vacía. Corre solo antes de `npm run dev` y `npm run build`; es seguro repetirlo.
 */
import { readFileSync } from 'node:fs';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { sql } from 'drizzle-orm';
import { createDb } from '../src/server/db/connect';
import { seedIfEmpty } from '../src/server/db/seed';

// Carga .env si existe (Next lo hace solo para la app; este script corre antes).
try {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2]!.replace(/^["']|["']$/g, '');
  }
} catch {
  // sin .env: se usan los valores por defecto
}

const url = process.env.DATABASE_URL || 'file:./data/finanzas.db';
const db = createDb(url, process.env.DATABASE_AUTH_TOKEN || undefined);

await migrate(db, { migrationsFolder: './drizzle' });
if (url.startsWith('file:')) await db.run(sql`PRAGMA journal_mode = WAL`);
const seeded = await seedIfEmpty(db);

const where = url.startsWith('file:') ? url.slice(5) : url.replace(/\/\/.*@/, '//');
console.log(`✔ Base de datos lista (${where})${seeded ? ' — datos iniciales cargados' : ''}`);
