import { desc, eq } from 'drizzle-orm';
import type { DbOrTx } from '../db/connect';
import { goalContributions, goals } from '../db/schema';
import type { GoalKind } from '@/lib/constants';
import { addMonths } from '@/lib/dates';
import { convertMinor } from '@/lib/money';
import { projectGoal } from '@/lib/projections';
import { AppError } from '../errors';
import { getAccountBalance, requireAccount } from './accounts';
import { crossRate } from './fx';

export interface GoalInput {
  name: string;
  kind: GoalKind;
  targetMinor: number;
  currency: string;
  targetDate: string | null;
  accountId: string | null;
  initialMinor: number;
  monthlyPlanMinor: number | null;
  expectedReturnEa: number;
  priority: number;
}

export interface GoalView {
  id: string;
  name: string;
  kind: GoalKind;
  status: string;
  currency: string;
  targetMinor: number;
  currentMinor: number;
  targetDate: string | null;
  accountId: string | null;
  monthlyMinor: number | null; // plan o promedio real de los últimos 3 meses
  monthlyIsPlan: boolean;
  monthlyNeededMinor: number | null;
  projectedDate: string | null;
  monthsLeft: number | null;
  pct: number;
  onTrack: boolean | null;
  expectedReturnEa: number;
  priority: number;
}

export async function createGoal(db: DbOrTx, g: GoalInput) {
  if (g.targetMinor <= 0) throw new AppError('El valor de la meta debe ser mayor que cero.');
  if (g.accountId) await requireAccount(db, g.accountId);
  const [row] = await db.insert(goals).values(g).returning({ id: goals.id });
  return row!.id;
}

export async function updateGoal(db: DbOrTx, id: string, patch: Partial<GoalInput> & { status?: 'active' | 'achieved' | 'paused' }) {
  await db.update(goals).set(patch).where(eq(goals.id, id));
}

export async function deleteGoal(db: DbOrTx, id: string) {
  await db.delete(goalContributions).where(eq(goalContributions.goalId, id));
  await db.delete(goals).where(eq(goals.id, id));
}

export async function addContribution(db: DbOrTx, goalId: string, amountMinor: number, date: string, note?: string | null) {
  const [goal] = await db.select().from(goals).where(eq(goals.id, goalId));
  if (!goal) throw new AppError('La meta no existe.');
  if (goal.accountId) throw new AppError('Esta meta usa el saldo de una cuenta: registra una transferencia a esa cuenta.');
  if (amountMinor === 0) throw new AppError('El aporte no puede ser cero.');
  await db.insert(goalContributions).values({ goalId, amountMinor, date, note: note || null });
}

export async function listGoals(db: DbOrTx, today: string): Promise<GoalView[]> {
  const rows = await db.select().from(goals).orderBy(goals.priority, goals.createdAt);
  const since = addMonths(today, -3);
  const out: GoalView[] = [];
  for (const g of rows) {
    let currentMinor = g.initialMinor;
    let avgMinor: number | null = null;
    if (g.accountId) {
      const bal = await getAccountBalance(db, g.accountId);
      const acc = await requireAccount(db, g.accountId).catch(() => null);
      currentMinor = acc && acc.currency !== g.currency ? convertMinor(bal, await crossRate(db, acc.currency, g.currency)) : bal;
    } else {
      const contribs = await db.select().from(goalContributions).where(eq(goalContributions.goalId, g.id)).orderBy(desc(goalContributions.date));
      currentMinor += contribs.reduce((s, c) => s + c.amountMinor, 0);
      const recent = contribs.filter((c) => c.date >= since).reduce((s, c) => s + c.amountMinor, 0);
      avgMinor = recent > 0 ? Math.round(recent / 3) : null;
    }
    const monthlyMinor = g.monthlyPlanMinor ?? avgMinor;
    const p = projectGoal({
      current: currentMinor,
      target: g.targetMinor,
      monthly: monthlyMinor ?? 0,
      ea: g.expectedReturnEa,
      today,
      targetDate: g.targetDate,
    });
    out.push({
      id: g.id,
      name: g.name,
      kind: g.kind,
      status: currentMinor >= g.targetMinor ? 'achieved' : g.status,
      currency: g.currency,
      targetMinor: g.targetMinor,
      currentMinor,
      targetDate: g.targetDate,
      accountId: g.accountId,
      monthlyMinor,
      monthlyIsPlan: g.monthlyPlanMinor != null,
      monthlyNeededMinor: p.monthlyNeeded == null ? null : Math.ceil(p.monthlyNeeded),
      projectedDate: p.projectedDate,
      monthsLeft: p.monthsLeft,
      pct: p.pct,
      onTrack: p.onTrack,
      expectedReturnEa: g.expectedReturnEa,
      priority: g.priority,
    });
  }
  return out;
}
