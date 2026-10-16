import 'server-only';
import { createDb, type Db } from './connect';

// Una sola conexión por proceso (en desarrollo Next recarga módulos; la guardamos en globalThis).
const globalForDb = globalThis as unknown as { __finanzasDb?: Db };

export const db: Db =
  globalForDb.__finanzasDb ??
  createDb(process.env.DATABASE_URL ?? 'file:./data/finanzas.db', process.env.DATABASE_AUTH_TOKEN);

if (process.env.NODE_ENV !== 'production') globalForDb.__finanzasDb = db;

export type { Db };
