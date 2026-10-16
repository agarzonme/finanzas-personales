/**
 * Respaldo completo en JSON. Sirve para:
 *  - guardar una copia (hazlo cada mes),
 *  - pasar tus datos del computador a la nube (exportas local → importas en Vercel/Turso).
 */
import type { Db } from '../db/connect';
import * as t from '../db/schema';
import { AppError } from '../errors';

const BACKUP_VERSION = 1;

// Orden de inserción (padres antes que hijos). Para borrar se usa el orden inverso.
const TABLES = [
  ['settings', t.settings],
  ['accounts', t.accounts],
  ['categories', t.categories],
  ['categoryRules', t.categoryRules],
  ['goals', t.goals],
  ['debts', t.debts],
  ['transactions', t.transactions],
  ['entries', t.entries],
  ['goalContributions', t.goalContributions],
  ['budgets', t.budgets],
  ['securities', t.securities],
  ['prices', t.prices],
  ['trades', t.trades],
  ['fxRates', t.fxRates],
  ['netWorthSnapshots', t.netWorthSnapshots],
] as const;

export interface Backup {
  app: 'mis-finanzas';
  version: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export async function exportBackup(db: Db): Promise<Backup> {
  const tables: Record<string, unknown[]> = {};
  for (const [name, table] of TABLES) tables[name] = await db.select().from(table);
  return { app: 'mis-finanzas', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables };
}

/** Reemplaza TODOS los datos por los del respaldo, en una sola transacción (todo o nada). */
export async function importBackup(db: Db, raw: unknown): Promise<Record<string, number>> {
  const backup = raw as Partial<Backup>;
  if (backup?.app !== 'mis-finanzas' || typeof backup.tables !== 'object' || backup.tables === null) {
    throw new AppError('El archivo no es un respaldo de esta app.');
  }
  if (backup.version !== BACKUP_VERSION) throw new AppError(`Versión de respaldo no soportada (${backup.version}).`);
  const counts: Record<string, number> = {};
  await db.transaction(async (tx) => {
    for (const [, table] of [...TABLES].reverse()) await tx.delete(table);
    for (const [name, table] of TABLES) {
      const rows = (backup.tables![name] ?? []) as Array<Record<string, unknown>>;
      if (!Array.isArray(rows)) throw new AppError(`La tabla ${name} del respaldo está dañada.`);
      // Inserta en bloques para no superar el límite de variables de SQLite.
      for (let i = 0; i < rows.length; i += 50) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await tx.insert(table).values(rows.slice(i, i + 50) as any);
      }
      counts[name] = rows.length;
    }
  });
  return counts;
}

/** Movimientos en CSV (abre bien en Excel con separador ";" y coma decimal). */
export function transactionsToCsv(
  rows: Array<{
    date: string;
    type: string;
    description: string;
    accountName: string;
    toAccountName: string | null;
    categoryName: string | null;
    amountMinor: number;
    currency: string;
    amountBaseMinor: number;
    notes: string | null;
  }>,
): string {
  const esc = (v: string | null) => `"${(v ?? '').replace(/"/g, '""')}"`;
  const num = (minor: number) => (minor / 100).toFixed(2).replace('.', ',');
  const header = ['Fecha', 'Tipo', 'Descripción', 'Cuenta', 'Cuenta destino', 'Categoría', 'Monto', 'Moneda', 'Monto COP', 'Notas'];
  const lines = rows.map((r) =>
    [r.date, r.type, esc(r.description), esc(r.accountName), esc(r.toAccountName), esc(r.categoryName), num(r.amountMinor), r.currency, num(r.amountBaseMinor), esc(r.notes)].join(';'),
  );
  return '﻿' + [header.join(';'), ...lines].join('\r\n');
}
