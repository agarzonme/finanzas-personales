'use server';

import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { categories, settings } from '../db/schema';
import { CATEGORY_KINDS } from '@/lib/constants';
import { setRate } from '../services/fx';
import { importBackup } from '../services/backup';
import { AppError } from '../errors';
import { type ActionState, FormError, date, decimal, oneOf, optId, optText, run, text } from './shared';

export async function setFxRateAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const currency = oneOf(fd, 'currency', ['USD', 'EUR'] as const, 'la moneda');
    const rate = decimal(fd, 'rate', 'La tasa');
    if (currency === 'USD' && (rate < 1000 || rate > 20000)) throw new FormError('Esa TRM se ve rara: escribe cuántos pesos vale 1 dólar (ej. 3.950,25).');
    await setRate(db, currency, date(fd, 'date'), rate);
    return `Tasa ${currency} guardada.`;
  });
}

export async function updateDefaultsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    await db
      .update(settings)
      .set({
        ownerName: optText(fd, 'ownerName') ?? '',
        defaultExpenseAccountId: optId(fd, 'defaultExpenseAccountId'),
        defaultIncomeAccountId: optId(fd, 'defaultIncomeAccountId'),
        defaultCardAccountId: optId(fd, 'defaultCardAccountId'),
        defaultInvestmentAccountId: optId(fd, 'defaultInvestmentAccountId'),
        cashAccountId: optId(fd, 'cashAccountId'),
      })
      .where(eq(settings.id, 1));
    return 'Preferencias guardadas.';
  });
}

export async function createCategoryAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const name = text(fd, 'name', 'el nombre', { max: 40 });
    const kind = oneOf(fd, 'kind', CATEGORY_KINDS, 'si es de gasto o ingreso');
    const dup = await db.select().from(categories).where(eq(categories.name, name));
    if (dup.some((c) => c.kind === kind)) throw new AppError('Ya existe esa categoría.');
    await db.insert(categories).values({ name, kind, icon: optText(fd, 'icon'), isEssential: fd.get('essential') === 'on' });
    return `Categoría "${name}" creada.`;
  });
}

export async function importBackupAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const file = fd.get('file');
    if (!(file instanceof File) || file.size === 0) throw new FormError('Elige el archivo de respaldo (.json).');
    if (file.size > 20 * 1024 * 1024) throw new FormError('El archivo supera 20 MB.');
    if (fd.get('confirm') !== 'REEMPLAZAR') throw new FormError('Escribe REEMPLAZAR para confirmar: esto borra los datos actuales.');
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      throw new FormError('El archivo no es un JSON válido.');
    }
    const counts = await importBackup(db, json);
    return `Respaldo importado: ${counts.transactions ?? 0} movimientos, ${counts.accounts ?? 0} cuentas.`;
  });
}
