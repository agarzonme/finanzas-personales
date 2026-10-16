/**
 * Libro mayor: crear, editar y borrar movimientos manteniendo los saldos correctos.
 *
 * Cada movimiento produce "entries" (asientos) con signo:
 *   gasto         → cuenta: −monto
 *   ingreso       → cuenta: +monto
 *   transferencia → origen: −monto, destino: +monto (convertido si las monedas difieren)
 *   trade/ajuste  → cuenta: ±monto (el signo lo da `direction`)
 * El saldo de una cuenta es su saldo inicial + la suma de sus entries.
 */
import { eq, inArray } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/connect';
import { categories, entries, trades, transactions } from '../db/schema';
import type { TransactionType } from '@/lib/constants';
import { convertMinor } from '@/lib/money';
import { isIsoDate } from '@/lib/dates';
import { AppError } from '../errors';
import { requireAccount } from './accounts';
import { learnRule, suggestCategory } from './categorize';
import { crossRate, requireRate } from './fx';

export interface NewTransaction {
  type: TransactionType;
  date: string;
  accountId: string;
  toAccountId?: string | null;
  amountMinor: number; // positivo, en `currency`
  currency?: string; // por defecto, la de la cuenta
  toAmountMinor?: number | null; // lo que llega a la cuenta destino (si la moneda difiere)
  categoryId?: string | null; // undefined = sugerir automáticamente
  description: string;
  notes?: string | null;
  goalId?: string | null;
  debtId?: string | null;
  source?: 'manual' | 'quick' | 'import' | 'system';
  direction?: 1 | -1; // solo trade y ajuste
}

interface Built {
  values: typeof transactions.$inferInsert;
  entries: Array<{ accountId: string; amountMinor: number }>;
}

async function build(db: DbOrTx, t: NewTransaction): Promise<Built> {
  if (!Number.isSafeInteger(t.amountMinor) || t.amountMinor <= 0) throw new AppError('El monto debe ser mayor que cero.');
  if (!isIsoDate(t.date)) throw new AppError('Fecha inválida.');
  const description = t.description.trim();
  if (!description) throw new AppError('Escribe una descripción.');

  const account = await requireAccount(db, t.accountId);
  const currency = t.currency ?? account.currency;
  const rateToBase = await requireRate(db, currency, t.date);
  const amountBaseMinor = convertMinor(t.amountMinor, rateToBase);

  // Monto en la moneda de la cuenta de origen.
  const accountAmount =
    currency === account.currency ? t.amountMinor : convertMinor(t.amountMinor, await crossRate(db, currency, account.currency, t.date));

  let categoryId: string | null = null;
  if (t.type === 'expense' || t.type === 'income') {
    if (t.categoryId) {
      const [cat] = await db.select().from(categories).where(eq(categories.id, t.categoryId));
      if (!cat) throw new AppError('La categoría no existe.');
      if (cat.kind !== t.type) throw new AppError(`"${cat.name}" es una categoría de ${cat.kind === 'expense' ? 'gastos' : 'ingresos'}.`);
      categoryId = cat.id;
    } else if (t.categoryId === undefined) {
      categoryId = await suggestCategory(db, description, t.type);
    }
  }

  const built: Built = {
    values: {
      type: t.type,
      date: t.date,
      accountId: account.id,
      toAccountId: null,
      amountMinor: t.amountMinor,
      currency,
      toAmountMinor: null,
      amountBaseMinor,
      fxRate: rateToBase,
      categoryId,
      description,
      notes: t.notes?.trim() || null,
      goalId: t.goalId ?? null,
      debtId: t.debtId ?? null,
      source: t.source ?? 'manual',
    },
    entries: [],
  };

  switch (t.type) {
    case 'expense':
      built.entries.push({ accountId: account.id, amountMinor: -accountAmount });
      break;
    case 'income':
      built.entries.push({ accountId: account.id, amountMinor: accountAmount });
      break;
    case 'transfer': {
      if (!t.toAccountId) throw new AppError('Elige la cuenta destino.');
      if (t.toAccountId === account.id) throw new AppError('La cuenta de origen y destino no pueden ser la misma.');
      const dest = await requireAccount(db, t.toAccountId);
      const toAmount =
        t.toAmountMinor ??
        (dest.currency === currency ? t.amountMinor : convertMinor(t.amountMinor, await crossRate(db, currency, dest.currency, t.date)));
      built.values.toAccountId = dest.id;
      built.values.toAmountMinor = toAmount;
      built.entries.push({ accountId: account.id, amountMinor: -accountAmount }, { accountId: dest.id, amountMinor: toAmount });
      break;
    }
    case 'trade':
    case 'adjustment':
      if (!t.direction) throw new AppError('Falta el sentido del movimiento.');
      built.entries.push({ accountId: account.id, amountMinor: t.direction * accountAmount });
      break;
  }
  return built;
}

/** Crea el movimiento y sus asientos dentro de una transacción de base de datos. */
export async function createTransaction(db: Db, t: NewTransaction): Promise<string> {
  return db.transaction(async (tx) => createTransactionIn(tx, t));
}

/** Igual que createTransaction pero dentro de una transacción ya abierta. */
export async function createTransactionIn(tx: DbOrTx, t: NewTransaction): Promise<string> {
  const built = await build(tx, t);
  const [row] = await tx.insert(transactions).values(built.values).returning({ id: transactions.id });
  const id = row!.id;
  await tx.insert(entries).values(built.entries.map((e) => ({ ...e, transactionId: id })));
  return id;
}

export interface TransactionPatch {
  date?: string;
  description?: string;
  amountMinor?: number;
  accountId?: string;
  toAccountId?: string | null;
  categoryId?: string | null;
  notes?: string | null;
}

/** Edita un movimiento y reconstruye sus asientos. Si cambias la categoría, aprende la regla. */
export async function updateTransaction(db: Db, id: string, patch: TransactionPatch) {
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(transactions).where(eq(transactions.id, id));
    if (!current) throw new AppError('El movimiento no existe.');
    if (current.type === 'trade') throw new AppError('Edita las compras y ventas desde Inversiones.');
    const prevEntries = await tx.select().from(entries).where(eq(entries.transactionId, id));
    const direction = current.type === 'adjustment' ? ((prevEntries[0]?.amountMinor ?? 1) < 0 ? -1 : 1) : undefined;

    const built = await build(tx, {
      type: current.type,
      date: patch.date ?? current.date,
      accountId: patch.accountId ?? current.accountId,
      toAccountId: patch.toAccountId === undefined ? current.toAccountId : patch.toAccountId,
      amountMinor: patch.amountMinor ?? current.amountMinor,
      currency: patch.accountId && patch.accountId !== current.accountId ? undefined : current.currency,
      toAmountMinor: patch.amountMinor === undefined && patch.toAccountId === undefined ? current.toAmountMinor : null,
      categoryId: patch.categoryId === undefined ? current.categoryId : patch.categoryId,
      description: patch.description ?? current.description,
      notes: patch.notes === undefined ? current.notes : patch.notes,
      goalId: current.goalId,
      debtId: current.debtId,
      source: current.source,
      direction,
    });
    await tx.update(transactions).set(built.values).where(eq(transactions.id, id));
    await tx.delete(entries).where(eq(entries.transactionId, id));
    await tx.insert(entries).values(built.entries.map((e) => ({ ...e, transactionId: id })));

    if (patch.categoryId && patch.categoryId !== current.categoryId) {
      await learnRule(tx, built.values.description, patch.categoryId);
    }
  });
}

export async function deleteTransactions(db: Db, ids: string[]) {
  if (!ids.length) return;
  await db.transaction(async (tx) => {
    await tx.delete(trades).where(inArray(trades.transactionId, ids));
    await tx.delete(entries).where(inArray(entries.transactionId, ids));
    await tx.delete(transactions).where(inArray(transactions.id, ids));
  });
}

/** Ajusta el saldo de una cuenta al valor real (lo que ves en la app del banco). */
export async function reconcileAccount(db: Db, accountId: string, actualMinor: number, date: string, currentMinor: number) {
  const diff = actualMinor - currentMinor;
  if (diff === 0) return null;
  return createTransaction(db, {
    type: 'adjustment',
    date,
    accountId,
    amountMinor: Math.abs(diff),
    description: 'Ajuste de saldo',
    direction: diff > 0 ? 1 : -1,
    source: 'system',
  });
}
