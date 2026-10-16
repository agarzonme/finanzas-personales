'use server';

import { db } from '../db/client';
import { DEBT_KINDS, GOAL_KINDS } from '@/lib/constants';
import { setBudget } from '../services/reports';
import { addContribution, createGoal, deleteGoal, updateGoal } from '../services/goals';
import { createDebt, deleteDebt, updateDebt } from '../services/debts';
import {
  type ActionState,
  date,
  id,
  int,
  money,
  month,
  oneOf,
  optDate,
  optId,
  optMoney,
  optText,
  percent,
  run,
  text,
} from './shared';

export async function setBudgetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const from = month(fd, 'month');
    await setBudget(db, id(fd, 'categoryId', 'la categoría'), money(fd, 'amount', 'el presupuesto', { allowZero: true }), from);
    return `Presupuesto guardado desde ${from}. Rige para los meses siguientes hasta que lo cambies.`;
  });
}

export async function createGoalAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const name = text(fd, 'name', 'el nombre', { max: 60 });
    await createGoal(db, {
      name,
      kind: oneOf(fd, 'kind', GOAL_KINDS, 'el tipo de meta'),
      targetMinor: money(fd, 'target', 'el valor de la meta'),
      currency: 'COP',
      targetDate: optDate(fd, 'targetDate'),
      accountId: optId(fd, 'accountId'),
      initialMinor: money(fd, 'initial', 'lo que ya tienes', { allowZero: true }),
      monthlyPlanMinor: optMoney(fd, 'monthly', 'el aporte mensual'),
      expectedReturnEa: percent(fd, 'returnEa', 'La rentabilidad'),
      priority: int(fd, 'priority', 1, 5) ?? 3,
    });
    return `Meta "${name}" creada.`;
  });
}

export async function contributeGoalAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const withdraw = fd.get('direction') === 'out';
    const amount = money(fd, 'amount', 'el monto');
    await addContribution(db, id(fd, 'goalId', 'la meta'), withdraw ? -amount : amount, date(fd, 'date'), optText(fd, 'note'));
    return withdraw ? 'Retiro registrado.' : 'Aporte registrado.';
  });
}

export async function goalStatusAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const status = fd.get('status') === 'paused' ? 'paused' : 'active';
    await updateGoal(db, id(fd, 'id', 'la meta'), { status });
    return status === 'paused' ? 'Meta en pausa.' : 'Meta activa.';
  });
}

export async function deleteGoalAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await deleteGoal(db, id(fd, 'id', 'la meta'));
    return 'Meta borrada.';
  });
}

export async function createDebtAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const name = text(fd, 'name', 'el nombre', { max: 60 });
    const accountId = optId(fd, 'accountId');
    await createDebt(db, {
      name,
      kind: oneOf(fd, 'kind', DEBT_KINDS, 'el tipo de deuda'),
      accountId,
      balanceMinor: accountId ? null : money(fd, 'balance', 'el saldo que debes', { allowZero: true }),
      originalMinor: money(fd, 'original', 'el monto original'),
      rateEa: percent(fd, 'rateEa', 'La tasa'),
      paymentMinor: optMoney(fd, 'payment', 'la cuota'),
      paymentDay: int(fd, 'paymentDay', 1, 31),
      currency: 'COP',
    });
    return `Deuda "${name}" registrada.`;
  });
}

export async function updateDebtAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const debtId = id(fd, 'id', 'la deuda');
    const patch: Parameters<typeof updateDebt>[2] = { paymentMinor: optMoney(fd, 'payment', 'la cuota') };
    if (fd.has('balance')) patch.balanceMinor = money(fd, 'balance', 'el saldo', { allowZero: true });
    await updateDebt(db, debtId, patch);
    return 'Deuda actualizada.';
  });
}

export async function deleteDebtAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await deleteDebt(db, id(fd, 'id', 'la deuda'));
    return 'Deuda borrada.';
  });
}
