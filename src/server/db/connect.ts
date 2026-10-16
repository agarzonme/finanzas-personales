import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';

export type Db = LibSQLDatabase<typeof schema>;
/** Conexión o transacción abierta: los servicios aceptan cualquiera de las dos. */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * `file:./data/finanzas.db` → SQLite en tu disco (modo local).
 * `libsql://...turso.io`     → Turso en la nube (requiere authToken).
 *
 * Nota: SQLite solo aplica las llaves foráneas si cada conexión activa `PRAGMA foreign_keys`,
 * y el cliente abre conexiones nuevas para las transacciones. Por eso la integridad
 * (que la cuenta exista, borrar en cascada) la verifican los servicios explícitamente.
 */
export function createDb(url: string, authToken?: string): Db {
  if (url.startsWith('file:')) {
    const path = url.slice('file:'.length);
    if (path && path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  }
  return drizzle(createClient({ url, authToken }), { schema });
}

export { schema };
