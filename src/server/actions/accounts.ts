'use server';

import { db } from '../db/client';
import { ACCOUNT_TYPES, CURRENCIES, isLiability } from '@/lib/constants';
import { today } from '@/lib/dates';
import { createAccount, deleteAccount, getAccountBalance, updateAccount } from '../services/accounts';
import { reconcileAccount } from '../services/ledger';
import { type ActionState, id, money, oneOf, optText, run, text } from './shared';

function aliases(fd: FormData) {
  return String(fd.get('aliases') ?? '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
}

export async function createAccountAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const name = text(fd, 'name', 'el nombre', { max: 60 });
    await createAccount(db, {
      name,
      type: oneOf(fd, 'type', ACCOUNT_TYPES, 'el tipo de cuenta'),
      institution: optText(fd, 'institution'),
      currency: oneOf(fd, 'currency', CURRENCIES, 'la moneda'),
      openingBalanceMinor: money(fd, 'opening', 'el saldo actual', { allowZero: true }),
      aliases: aliases(fd),
      includeInNetWorth: fd.get('includeInNetWorth') !== 'off',
    });
    return `Cuenta "${name}" creada.`;
  });
}

export async function updateAccountAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await updateAccount(db, id(fd, 'id', 'la cuenta'), {
      name: text(fd, 'name', 'el nombre', { max: 60 }),
      institution: optText(fd, 'institution'),
      aliases: aliases(fd),
      includeInNetWorth: fd.get('includeInNetWorth') === 'on',
    });
    return 'Cuenta actualizada.';
  });
}

export async function archiveAccountAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const archived = fd.get('archived') === 'true';
    await updateAccount(db, id(fd, 'id', 'la cuenta'), { archived });
    return archived ? 'Cuenta archivada: ya no aparece en listas ni en el patrimonio.' : 'Cuenta restaurada.';
  });
}

export async function deleteAccountAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await deleteAccount(db, id(fd, 'id', 'la cuenta'));
    return 'Cuenta borrada.';
  });
}

export async function reconcileAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const accountId = id(fd, 'id', 'la cuenta');
    const type = oneOf(fd, 'type', ACCOUNT_TYPES, 'el tipo de cuenta');
    let actual = money(fd, 'actual', 'el saldo real', { allowZero: true, allowNegative: true });
    if (isLiability(type)) actual = -Math.abs(actual); // en tarjetas escribes lo que debes
    const current = await getAccountBalance(db, accountId);
    const txId = await reconcileAccount(db, accountId, actual, today(), current);
    return txId ? 'Saldo ajustado. Quedó un movimiento "Ajuste de saldo" con la diferencia.' : 'El saldo ya coincidía.';
  });
}
