'use server';

import { db } from '../db/client';
import { ASSET_CLASSES } from '@/lib/constants';
import { createTrade, updatePrice } from '../services/investments';
import { deleteTransactions } from '../services/ledger';
import { type ActionState, date, decimal, id, money, oneOf, optText, run, text } from './shared';

export async function createTradeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const side = oneOf(fd, 'side', ['buy', 'sell'] as const, 'compra o venta');
    const symbol = text(fd, 'symbol', 'el símbolo', { max: 15 }).toUpperCase();
    const quantity = decimal(fd, 'quantity', 'La cantidad');
    const price = decimal(fd, 'price', 'El precio');
    await createTrade(db, {
      accountId: id(fd, 'accountId', 'la cuenta de inversión'),
      symbol,
      name: optText(fd, 'name'),
      assetClass: oneOf(fd, 'assetClass', ASSET_CLASSES, 'el tipo de activo'),
      side,
      quantity,
      price,
      feesMinor: money(fd, 'fees', 'la comisión', { allowZero: true }),
      date: date(fd, 'date'),
    });
    return `${side === 'buy' ? 'Compra' : 'Venta'} de ${quantity} ${symbol} registrada.`;
  });
}

export async function updatePriceAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await updatePrice(db, id(fd, 'securityId', 'el activo'), decimal(fd, 'price', 'El precio'), date(fd, 'date'));
    return 'Precio actualizado.';
  });
}

export async function deleteTradeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await deleteTransactions(db, [id(fd, 'transactionId', 'la operación')]);
    return 'Operación borrada y efectivo devuelto a la cuenta.';
  });
}
