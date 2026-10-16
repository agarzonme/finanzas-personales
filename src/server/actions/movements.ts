'use server';

import { db } from '../db/client';
import { today as todayFn } from '@/lib/dates';
import { TRANSACTION_TYPES } from '@/lib/constants';
import { createTransaction, deleteTransactions, updateTransaction } from '../services/ledger';
import { quickAdd } from '../services/quickAdd';
import { budgetWarningFor } from '../services/reports';
import { type ActionState, FormError, date, id, money, oneOf, optId, optText, run, text } from './shared';

export async function quickAddAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const phrase = text(fd, 'text', 'la frase', { max: 200 });
    const r = await quickAdd(db, phrase, todayFn());
    return { message: r.message, warning: r.warning };
  });
}

export async function createTransactionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const type = oneOf(fd, 'type', TRANSACTION_TYPES.filter((t) => t === 'expense' || t === 'income' || t === 'transfer'), 'el tipo');
    const toAccountId = type === 'transfer' ? id(fd, 'toAccountId', 'la cuenta destino') : null;
    const categoryId = type === 'transfer' ? null : optId(fd, 'categoryId');
    const t = {
      type,
      date: date(fd, 'date'),
      accountId: id(fd, 'accountId', 'la cuenta'),
      toAccountId,
      amountMinor: money(fd, 'amount', 'el monto'),
      description: text(fd, 'description', 'la descripción', { max: 200 }),
      notes: optText(fd, 'notes'),
      // Sin categoría elegida → la app la sugiere con tus reglas.
      categoryId: categoryId ?? undefined,
    };
    if (toAccountId && toAccountId === t.accountId) throw new FormError('Origen y destino no pueden ser la misma cuenta.');
    await createTransaction(db, t);
    const warning = type === 'expense' && categoryId ? await budgetWarningFor(db, categoryId, t.date) : null;
    return { message: 'Movimiento guardado.', warning };
  });
}

export async function updateCategoryAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const txId = id(fd, 'id', 'el movimiento');
    const categoryId = optId(fd, 'categoryId');
    await updateTransaction(db, txId, { categoryId });
    return 'Categoría actualizada. Los próximos movimientos parecidos usarán esta categoría.';
  });
}

export async function updateTransactionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await updateTransaction(db, id(fd, 'id', 'el movimiento'), {
      date: date(fd, 'date'),
      description: text(fd, 'description', 'la descripción', { max: 200 }),
      amountMinor: money(fd, 'amount', 'el monto'),
      notes: optText(fd, 'notes'),
    });
    return 'Movimiento actualizado.';
  });
}

export async function deleteTransactionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await deleteTransactions(db, [id(fd, 'id', 'el movimiento')]);
    return 'Movimiento borrado.';
  });
}
