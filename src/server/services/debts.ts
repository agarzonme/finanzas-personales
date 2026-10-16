import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../db/connect';
import { debts } from '../db/schema';
import type { DebtKind } from '@/lib/constants';
import { projectPayoff } from '@/lib/projections';
import { AppError } from '../errors';
import { getAccountBalance, requireAccount } from './accounts';

export interface DebtInput {
  name: string;
  kind: DebtKind;
  accountId: string | null;
  balanceMinor: number | null;
  originalMinor: number;
  rateEa: number;
  paymentMinor: number | null;
  paymentDay: number | null;
  currency: string;
}

export interface DebtView {
  id: string;
  name: string;
  kind: DebtKind;
  status: string;
  currency: string;
  accountId: string | null;
  balanceMinor: number; // lo que debes hoy (positivo)
  originalMinor: number;
  rateEa: number;
  paymentMinor: number | null;
  paymentDay: number | null;
  paidPct: number;
  monthsLeft: number | null;
  payoffDate: string | null;
  totalInterestMinor: number | null;
  interestOnlyMinor: number; // pago mínimo solo para cubrir intereses del mes
}

export async function createDebt(db: DbOrTx, d: DebtInput) {
  if (d.accountId) await requireAccount(db, d.accountId);
  if (!d.accountId && (d.balanceMinor == null || d.balanceMinor < 0)) throw new AppError('Escribe el saldo que debes hoy.');
  if (d.rateEa < 0 || d.rateEa > 2) throw new AppError('La tasa EA debe estar entre 0 % y 200 %.');
  const [row] = await db.insert(debts).values(d).returning({ id: debts.id });
  return row!.id;
}

export async function updateDebt(db: DbOrTx, id: string, patch: Partial<DebtInput> & { status?: 'active' | 'paid_off' }) {
  await db.update(debts).set(patch).where(eq(debts.id, id));
}

export async function deleteDebt(db: DbOrTx, id: string) {
  await db.delete(debts).where(eq(debts.id, id));
}

export async function listDebts(db: DbOrTx, today: string): Promise<DebtView[]> {
  const rows = await db.select().from(debts).orderBy(debts.createdAt);
  const out: DebtView[] = [];
  for (const d of rows) {
    const balanceMinor = d.accountId ? Math.max(0, -(await getAccountBalance(db, d.accountId))) : (d.balanceMinor ?? 0);
    const p = d.paymentMinor ? projectPayoff(balanceMinor, d.rateEa, d.paymentMinor, today) : null;
    const interestOnly = projectPayoff(balanceMinor, d.rateEa, Number.MAX_SAFE_INTEGER, today).minimumToCoverInterest;
    out.push({
      id: d.id,
      name: d.name,
      kind: d.kind,
      status: balanceMinor === 0 ? 'paid_off' : d.status,
      currency: d.currency,
      accountId: d.accountId,
      balanceMinor,
      originalMinor: d.originalMinor,
      rateEa: d.rateEa,
      paymentMinor: d.paymentMinor,
      paymentDay: d.paymentDay,
      paidPct: d.originalMinor > 0 ? Math.min(1, Math.max(0, 1 - balanceMinor / d.originalMinor)) : 0,
      monthsLeft: p?.months ?? null,
      payoffDate: p?.payoffDate ?? null,
      totalInterestMinor: p?.totalInterest == null ? null : Math.round(p.totalInterest),
      interestOnlyMinor: Math.ceil(interestOnly),
    });
  }
  return out;
}

/** Deudas sin cuenta asociada (para sumarlas al pasivo del patrimonio). */
export async function unlinkedDebtsMinor(db: DbOrTx): Promise<number> {
  const rows = await db.select().from(debts).where(eq(debts.status, 'active'));
  return rows.filter((d) => !d.accountId).reduce((s, d) => s + (d.balanceMinor ?? 0), 0);
}
