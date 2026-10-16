import { and, desc, eq, lte } from 'drizzle-orm';
import type { DbOrTx } from '../db/connect';
import { fxRates } from '../db/schema';
import { BASE_CURRENCY } from '@/lib/constants';
import { AppError } from '../errors';

/** Pesos colombianos por 1 unidad de `currency` en `date` (o la última tasa anterior). */
export async function getRate(db: DbOrTx, currency: string, date?: string): Promise<number | null> {
  if (currency === BASE_CURRENCY) return 1;
  const where = date ? and(eq(fxRates.currency, currency), lte(fxRates.date, date)) : eq(fxRates.currency, currency);
  const [row] = await db.select({ rate: fxRates.rate }).from(fxRates).where(where).orderBy(desc(fxRates.date)).limit(1);
  if (row) return row.rate;
  if (date) {
    // Si no hay tasa anterior a la fecha, usa la más antigua disponible.
    const [any] = await db.select({ rate: fxRates.rate }).from(fxRates).where(eq(fxRates.currency, currency)).orderBy(fxRates.date).limit(1);
    return any?.rate ?? null;
  }
  return null;
}

export async function requireRate(db: DbOrTx, currency: string, date?: string): Promise<number> {
  const rate = await getRate(db, currency, date);
  if (rate == null) {
    throw new AppError(`Falta la tasa de cambio ${currency}→COP. Regístrala en Ajustes (por ejemplo, la TRM del día).`);
  }
  return rate;
}

/** Factor para pasar de la moneda `from` a la moneda `to` usando COP como puente. */
export async function crossRate(db: DbOrTx, from: string, to: string, date?: string): Promise<number> {
  if (from === to) return 1;
  const a = await requireRate(db, from, date);
  const b = await requireRate(db, to, date);
  return a / b;
}

/** Tasas más recientes por moneda, para valorizar saldos de hoy. */
export async function latestRates(db: DbOrTx): Promise<Map<string, number>> {
  const rows = await db.select().from(fxRates).orderBy(fxRates.currency, desc(fxRates.date));
  const map = new Map<string, number>([[BASE_CURRENCY, 1]]);
  for (const r of rows) if (!map.has(r.currency)) map.set(r.currency, r.rate);
  return map;
}

export async function setRate(db: DbOrTx, currency: string, date: string, rate: number) {
  if (currency === BASE_CURRENCY) throw new AppError('La moneda base no necesita tasa.');
  if (!(rate > 0)) throw new AppError('La tasa debe ser mayor que cero.');
  await db
    .insert(fxRates)
    .values({ currency, date, rate })
    .onConflictDoUpdate({ target: [fxRates.currency, fxRates.date], set: { rate } });
}

export async function listRates(db: DbOrTx, limit = 20) {
  return db.select().from(fxRates).orderBy(desc(fxRates.date)).limit(limit);
}
