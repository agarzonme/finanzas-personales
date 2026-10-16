import { and, eq, ne, sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/connect';
import { accounts, entries, goals, debts, settings, trades, transactions } from '../db/schema';
import { type AccountType, isLiability } from '@/lib/constants';
import { convertMinor } from '@/lib/money';
import { normalize } from '@/lib/text';
import { AppError } from '../errors';
import { latestRates } from './fx';

export interface AccountWithBalance {
  id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  currency: string;
  aliases: string[];
  archived: boolean;
  includeInNetWorth: boolean;
  openingBalanceMinor: number;
  balanceMinor: number; // moneda de la cuenta; pasivos en negativo
  balanceBaseMinor: number | null; // en COP; null si falta la tasa
  isLiability: boolean;
}

export async function listAccountsWithBalances(db: DbOrTx, opts: { includeArchived?: boolean } = {}): Promise<AccountWithBalance[]> {
  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      type: accounts.type,
      institution: accounts.institution,
      currency: accounts.currency,
      aliases: accounts.aliases,
      archived: accounts.archived,
      includeInNetWorth: accounts.includeInNetWorth,
      openingBalanceMinor: accounts.openingBalanceMinor,
      movements: sql<number>`coalesce(sum(${entries.amountMinor}), 0)`,
    })
    .from(accounts)
    .leftJoin(entries, eq(entries.accountId, accounts.id))
    .where(opts.includeArchived ? undefined : eq(accounts.archived, false))
    .groupBy(accounts.id)
    .orderBy(accounts.sortOrder, accounts.name);

  const rates = await latestRates(db);
  return rows.map((r) => {
    const balanceMinor = r.openingBalanceMinor + Number(r.movements);
    const rate = rates.get(r.currency);
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      institution: r.institution,
      currency: r.currency,
      aliases: r.aliases,
      archived: r.archived,
      includeInNetWorth: r.includeInNetWorth,
      openingBalanceMinor: r.openingBalanceMinor,
      balanceMinor,
      balanceBaseMinor: rate == null ? null : convertMinor(balanceMinor, rate),
      isLiability: isLiability(r.type),
    };
  });
}

export async function getAccountBalance(db: DbOrTx, accountId: string): Promise<number> {
  const [acc] = await db.select({ opening: accounts.openingBalanceMinor }).from(accounts).where(eq(accounts.id, accountId));
  if (!acc) throw new AppError('La cuenta no existe.');
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${entries.amountMinor}), 0)` })
    .from(entries)
    .where(eq(entries.accountId, accountId));
  return acc.opening + Number(row?.total ?? 0);
}

export async function requireAccount(db: DbOrTx, id: string) {
  const [acc] = await db.select().from(accounts).where(eq(accounts.id, id));
  if (!acc) throw new AppError('La cuenta no existe.');
  if (acc.archived) throw new AppError(`La cuenta "${acc.name}" está archivada.`);
  return acc;
}

export interface AccountInput {
  name: string;
  type: AccountType;
  institution?: string | null;
  currency: string;
  /** Saldo actual. En tarjetas y créditos escribe lo que debes como número positivo. */
  openingBalanceMinor: number;
  aliases: string[];
  includeInNetWorth: boolean;
}

function cleanAliases(name: string, aliases: string[]) {
  const set = new Set([normalize(name), ...aliases.map(normalize)].filter((a) => a.length >= 2));
  return [...set].slice(0, 10);
}

export async function createAccount(db: DbOrTx, input: AccountInput) {
  const dup = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.name, input.name.trim()));
  if (dup.length) throw new AppError(`Ya existe una cuenta llamada "${input.name}".`);
  const opening = isLiability(input.type) ? -Math.abs(input.openingBalanceMinor) : input.openingBalanceMinor;
  const [maxOrder] = await db.select({ m: sql<number>`coalesce(max(${accounts.sortOrder}), 0)` }).from(accounts);
  const [row] = await db
    .insert(accounts)
    .values({
      name: input.name.trim(),
      type: input.type,
      institution: input.institution || null,
      currency: input.currency,
      openingBalanceMinor: opening,
      aliases: cleanAliases(input.name, input.aliases),
      includeInNetWorth: input.includeInNetWorth,
      sortOrder: Number(maxOrder?.m ?? 0) + 1,
    })
    .returning({ id: accounts.id });
  return row!.id;
}

export async function updateAccount(db: DbOrTx, id: string, input: Partial<AccountInput> & { archived?: boolean }) {
  const [acc] = await db.select().from(accounts).where(eq(accounts.id, id));
  if (!acc) throw new AppError('La cuenta no existe.');
  if (input.name && input.name.trim() !== acc.name) {
    const dup = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.name, input.name.trim()), ne(accounts.id, id)));
    if (dup.length) throw new AppError(`Ya existe una cuenta llamada "${input.name}".`);
  }
  const type = input.type ?? acc.type;
  await db
    .update(accounts)
    .set({
      name: input.name?.trim() ?? acc.name,
      type,
      institution: input.institution === undefined ? acc.institution : input.institution || null,
      aliases: input.aliases ? cleanAliases(input.name ?? acc.name, input.aliases) : acc.aliases,
      includeInNetWorth: input.includeInNetWorth ?? acc.includeInNetWorth,
      archived: input.archived ?? acc.archived,
      openingBalanceMinor:
        input.openingBalanceMinor === undefined
          ? acc.openingBalanceMinor
          : isLiability(type)
            ? -Math.abs(input.openingBalanceMinor)
            : input.openingBalanceMinor,
    })
    .where(eq(accounts.id, id));
}

/** Borra una cuenta solo si no tiene movimientos; si tiene, archívala. */
export async function deleteAccount(db: DbOrTx, id: string) {
  const [used] = await db.select({ n: sql<number>`count(*)` }).from(transactions).where(sql`${transactions.accountId} = ${id} or ${transactions.toAccountId} = ${id}`);
  const [tradeCount] = await db.select({ n: sql<number>`count(*)` }).from(trades).where(eq(trades.accountId, id));
  if (Number(used?.n) > 0 || Number(tradeCount?.n) > 0) throw new AppError('La cuenta tiene movimientos: archívala en lugar de borrarla.');
  await db.update(goals).set({ accountId: null }).where(eq(goals.accountId, id));
  await db.update(debts).set({ accountId: null }).where(eq(debts.accountId, id));
  const [s] = await db.select().from(settings).where(eq(settings.id, 1));
  if (s) {
    const clear = (v: string | null) => (v === id ? null : v);
    await db
      .update(settings)
      .set({
        defaultExpenseAccountId: clear(s.defaultExpenseAccountId),
        defaultIncomeAccountId: clear(s.defaultIncomeAccountId),
        defaultCardAccountId: clear(s.defaultCardAccountId),
        defaultInvestmentAccountId: clear(s.defaultInvestmentAccountId),
        cashAccountId: clear(s.cashAccountId),
      })
      .where(eq(settings.id, 1));
  }
  await db.delete(accounts).where(eq(accounts.id, id));
}
