/** Reportes: resumen del mes, flujo de caja, gasto por categoría, presupuestos y patrimonio. */
import { and, asc, desc, eq, gte, inArray, like, lt, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { DbOrTx } from '../db/connect';
import { accounts, budgets, categories, debts, netWorthSnapshots, transactions } from '../db/schema';
import { monthRange, shiftMonth } from '@/lib/dates';
import { convertMinor } from '@/lib/money';
import { AppError } from '../errors';
import { type AccountWithBalance, listAccountsWithBalances } from './accounts';
import { latestRates } from './fx';
import { computePositions } from './investments';

// ---------- Resumen del mes ----------

export interface CategorySpend {
  categoryId: string | null;
  name: string;
  icon: string | null;
  amountMinor: number;
}

export async function monthTotals(db: DbOrTx, month: string) {
  const { start, end } = monthRange(month);
  const rows = await db
    .select({ type: transactions.type, total: sql<number>`coalesce(sum(${transactions.amountBaseMinor}), 0)` })
    .from(transactions)
    .where(and(gte(transactions.date, start), lt(transactions.date, end), inArray(transactions.type, ['income', 'expense'])))
    .groupBy(transactions.type);
  const income = Number(rows.find((r) => r.type === 'income')?.total ?? 0);
  const expenses = Number(rows.find((r) => r.type === 'expense')?.total ?? 0);
  return { income, expenses, net: income - expenses, savingsRate: income > 0 ? (income - expenses) / income : null };
}

export async function spendingByCategory(db: DbOrTx, month: string): Promise<CategorySpend[]> {
  const { start, end } = monthRange(month);
  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      name: categories.name,
      icon: categories.icon,
      total: sql<number>`sum(${transactions.amountBaseMinor})`,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.type, 'expense'), gte(transactions.date, start), lt(transactions.date, end)))
    .groupBy(transactions.categoryId)
    .orderBy(desc(sql`sum(${transactions.amountBaseMinor})`));
  return rows.map((r) => ({ categoryId: r.categoryId, name: r.name ?? 'Sin categoría', icon: r.icon, amountMinor: Number(r.total) }));
}

export interface CashflowPoint {
  month: string;
  incomeMinor: number;
  expensesMinor: number;
  netMinor: number;
}

export async function cashflow(db: DbOrTx, lastMonth: string, months = 12): Promise<CashflowPoint[]> {
  const first = shiftMonth(lastMonth, -(months - 1));
  const { end } = monthRange(lastMonth);
  const rows = await db
    .select({
      month: sql<string>`substr(${transactions.date}, 1, 7)`,
      type: transactions.type,
      total: sql<number>`sum(${transactions.amountBaseMinor})`,
    })
    .from(transactions)
    .where(and(gte(transactions.date, `${first}-01`), lt(transactions.date, end), inArray(transactions.type, ['income', 'expense'])))
    .groupBy(sql`substr(${transactions.date}, 1, 7)`, transactions.type);
  const points: CashflowPoint[] = [];
  for (let i = 0; i < months; i++) {
    const m = shiftMonth(first, i);
    const income = Number(rows.find((r) => r.month === m && r.type === 'income')?.total ?? 0);
    const expenses = Number(rows.find((r) => r.month === m && r.type === 'expense')?.total ?? 0);
    points.push({ month: m, incomeMinor: income, expensesMinor: expenses, netMinor: income - expenses });
  }
  return points;
}

// ---------- Presupuestos ----------

export interface BudgetStatus {
  categoryId: string;
  name: string;
  icon: string | null;
  budgetMinor: number;
  spentMinor: number;
  remainingMinor: number;
  pct: number;
  status: 'ok' | 'warning' | 'exceeded';
}

export const BUDGET_WARNING_AT = 0.8;

export async function budgetStatus(db: DbOrTx, month: string): Promise<BudgetStatus[]> {
  const all = await db
    .select({ categoryId: budgets.categoryId, amountMinor: budgets.amountMinor, effectiveFrom: budgets.effectiveFrom, name: categories.name, icon: categories.icon })
    .from(budgets)
    .innerJoin(categories, eq(categories.id, budgets.categoryId))
    .where(sql`${budgets.effectiveFrom} <= ${month}`)
    .orderBy(asc(budgets.effectiveFrom));
  // El presupuesto vigente de cada categoría es el más reciente que empezó en o antes del mes.
  const current = new Map<string, (typeof all)[number]>();
  for (const b of all) current.set(b.categoryId, b);

  const spent = new Map((await spendingByCategory(db, month)).map((s) => [s.categoryId, s.amountMinor]));
  const out: BudgetStatus[] = [];
  for (const b of current.values()) {
    if (b.amountMinor <= 0) continue; // presupuesto en cero = desactivado
    const s = spent.get(b.categoryId) ?? 0;
    const pct = s / b.amountMinor;
    out.push({
      categoryId: b.categoryId,
      name: b.name,
      icon: b.icon,
      budgetMinor: b.amountMinor,
      spentMinor: s,
      remainingMinor: b.amountMinor - s,
      pct,
      status: pct >= 1 ? 'exceeded' : pct >= BUDGET_WARNING_AT ? 'warning' : 'ok',
    });
  }
  return out.sort((a, b) => b.pct - a.pct);
}

export async function setBudget(db: DbOrTx, categoryId: string, amountMinor: number, effectiveFrom: string) {
  if (amountMinor < 0) throw new AppError('El presupuesto no puede ser negativo.');
  const [cat] = await db.select().from(categories).where(eq(categories.id, categoryId));
  if (!cat || cat.kind !== 'expense') throw new AppError('Elige una categoría de gastos.');
  await db
    .insert(budgets)
    .values({ categoryId, amountMinor, effectiveFrom })
    .onConflictDoUpdate({ target: [budgets.categoryId, budgets.effectiveFrom], set: { amountMinor } });
}

/** Mensaje de alerta si un gasto deja la categoría por encima del 80 % o del 100 %. */
export async function budgetWarningFor(db: DbOrTx, categoryId: string | null, date: string): Promise<string | null> {
  if (!categoryId) return null;
  const status = (await budgetStatus(db, date.slice(0, 7))).find((b) => b.categoryId === categoryId);
  if (!status || status.status === 'ok') return null;
  const pct = Math.round(status.pct * 100);
  return status.status === 'exceeded'
    ? `Te pasaste del presupuesto de ${status.name}: llevas ${pct} %.`
    : `Ojo: ya usaste el ${pct} % del presupuesto de ${status.name}.`;
}

// ---------- Patrimonio ----------

export interface NetWorth {
  date: string;
  assetsMinor: number; // efectivo y cuentas (incluye efectivo en brokers)
  investmentsMinor: number; // posiciones a precio de mercado
  liabilitiesMinor: number; // lo que debes, en positivo
  netWorthMinor: number;
  accounts: AccountWithBalance[];
  missingRates: string[];
}

export async function netWorth(db: DbOrTx, date: string, opts: { snapshot?: boolean } = {}): Promise<NetWorth> {
  const accs = await listAccountsWithBalances(db);
  const positions = await computePositions(db);
  const rates = await latestRates(db);
  const missing = new Set<string>();

  let assets = 0;
  let liabilities = 0;
  for (const a of accs) {
    if (!a.includeInNetWorth) continue;
    if (a.balanceBaseMinor == null) {
      if (a.balanceMinor !== 0) missing.add(a.currency); // una cuenta en cero no necesita tasa
      continue;
    }
    if (a.isLiability) liabilities += -a.balanceBaseMinor;
    else assets += a.balanceBaseMinor;
  }
  let investments = 0;
  for (const p of positions) {
    if (p.valueBaseMinor == null) missing.add(p.currency);
    else investments += p.valueBaseMinor;
  }
  const unlinked = await db.select().from(debts).where(eq(debts.status, 'active'));
  for (const d of unlinked) {
    if (d.accountId) continue;
    const rate = rates.get(d.currency);
    if (rate == null) missing.add(d.currency);
    else liabilities += convertMinor(d.balanceMinor ?? 0, rate);
  }

  const result: NetWorth = {
    date,
    assetsMinor: assets,
    investmentsMinor: investments,
    liabilitiesMinor: liabilities,
    netWorthMinor: assets + investments - liabilities,
    accounts: accs,
    missingRates: [...missing],
  };

  if (opts.snapshot) {
    const values = {
      assetsMinor: result.assetsMinor,
      liabilitiesMinor: result.liabilitiesMinor,
      investmentsMinor: result.investmentsMinor,
      netWorthMinor: result.netWorthMinor,
    };
    await db.insert(netWorthSnapshots).values({ date, ...values }).onConflictDoUpdate({ target: netWorthSnapshots.date, set: values });
  }
  return result;
}

export async function netWorthHistory(db: DbOrTx, limit = 400) {
  const rows = await db.select().from(netWorthSnapshots).orderBy(desc(netWorthSnapshots.date)).limit(limit);
  return rows.reverse();
}

// ---------- Lista de movimientos ----------

export interface TransactionFilters {
  month?: string;
  accountId?: string;
  categoryId?: string;
  type?: string;
  q?: string;
  limit?: number;
}

export async function listTransactions(db: DbOrTx, f: TransactionFilters) {
  const toAcc = alias(accounts, 'to_acc');
  const conds = [];
  if (f.month) {
    const { start, end } = monthRange(f.month);
    conds.push(gte(transactions.date, start), lt(transactions.date, end));
  }
  if (f.accountId) conds.push(or(eq(transactions.accountId, f.accountId), eq(transactions.toAccountId, f.accountId)));
  if (f.categoryId) conds.push(f.categoryId === 'none' ? sql`${transactions.categoryId} is null` : eq(transactions.categoryId, f.categoryId));
  if (f.type) conds.push(eq(transactions.type, f.type as 'expense'));
  if (f.q) conds.push(like(transactions.description, `%${f.q.replace(/[%_]/g, '')}%`));

  return db
    .select({
      id: transactions.id,
      type: transactions.type,
      date: transactions.date,
      description: transactions.description,
      notes: transactions.notes,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      amountBaseMinor: transactions.amountBaseMinor,
      toAmountMinor: transactions.toAmountMinor,
      accountId: transactions.accountId,
      accountName: accounts.name,
      toAccountId: transactions.toAccountId,
      toAccountName: toAcc.name,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      source: transactions.source,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(toAcc, eq(toAcc.id, transactions.toAccountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(f.limit ?? 300);
}

export async function listCategories(db: DbOrTx) {
  return db.select().from(categories).where(eq(categories.archived, false)).orderBy(categories.kind, categories.name);
}
