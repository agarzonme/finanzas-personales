'use client';

import { useState } from 'react';
import { deleteTransactionAction, updateCategoryAction, updateTransactionAction } from '@/server/actions/movements';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { formatMoney, toInputValue } from '@/lib/money';
import { TRANSACTION_TYPE_LABEL, type TransactionType } from '@/lib/constants';

interface Row {
  id: string;
  type: TransactionType;
  date: string;
  description: string;
  notes: string | null;
  amountMinor: number;
  currency: string;
  toAmountMinor: number | null;
  accountName: string;
  toAccountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
}

interface CategoryOption {
  id: string;
  name: string;
  kind: 'expense' | 'income';
  icon: string | null;
}

export function TransactionRow({ row, categories }: { row: Row; categories: CategoryOption[] }) {
  const [open, setOpen] = useState(false);
  const sign = row.type === 'expense' ? -1 : row.type === 'income' ? 1 : 0;
  const color = sign < 0 ? 'text-red' : sign > 0 ? 'text-ledger' : 'text-ink-soft';
  const where =
    row.type === 'transfer' ? `${row.accountName} → ${row.toAccountName}` : row.type === 'trade' || row.type === 'adjustment' ? `${TRANSACTION_TYPE_LABEL[row.type]} en ${row.accountName}` : row.accountName;
  const cats = categories.filter((c) => c.kind === row.type);

  return (
    <li className="py-2.5">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start justify-between gap-4 text-left">
        <span className="min-w-0">
          <span className="block truncate">
            <span aria-hidden className="mr-2">
              {row.categoryIcon ?? (row.type === 'transfer' ? '⇄' : '·')}
            </span>
            {row.description}
          </span>
          <span className="block text-xs text-ink-soft">
            {row.categoryName ?? (row.type === 'expense' || row.type === 'income' ? 'Sin categoría' : '')}
            {row.categoryName || row.type === 'expense' || row.type === 'income' ? ', ' : ''}
            {where}
          </span>
        </span>
        <span className={`num shrink-0 ${color}`}>
          {sign < 0 ? '−' : sign > 0 ? '+' : ''}
          {formatMoney(row.amountMinor, row.currency)}
        </span>
      </button>

      {open ? (
        <div className="mt-3 grid gap-4 rounded-md border border-rule bg-sheet p-4 md:grid-cols-2">
          {cats.length ? (
            <ActionForm action={updateCategoryAction} resetOnSuccess={false}>
              <input type="hidden" name="id" value={row.id} />
              <label className="block text-sm">
                <span className="mb-1 block text-ink-soft">Categoría</span>
                <select name="categoryId" defaultValue={row.categoryId ?? ''} className="field">
                  <option value="">Sin categoría</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <SubmitButton variant="quiet" className="mt-2">
                Cambiar categoría
              </SubmitButton>
            </ActionForm>
          ) : null}

          {row.type !== 'trade' ? (
            <ActionForm action={updateTransactionAction} resetOnSuccess={false} className="space-y-2">
              <input type="hidden" name="id" value={row.id} />
              <div className="grid grid-cols-2 gap-2">
                <input name="date" type="date" defaultValue={row.date} className="field" aria-label="Fecha" />
                <input name="amount" inputMode="decimal" defaultValue={toInputValue(row.amountMinor)} className="field num" aria-label="Monto" />
              </div>
              <input name="description" defaultValue={row.description} className="field" aria-label="Descripción" />
              <input name="notes" defaultValue={row.notes ?? ''} placeholder="Notas" className="field" aria-label="Notas" />
              <SubmitButton variant="quiet">Guardar cambios</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-sm text-ink-soft">Las compras y ventas se editan o borran desde Inversiones.</p>
          )}

          {row.type !== 'trade' ? (
            <ActionForm action={deleteTransactionAction} confirm={`¿Borrar "${row.description}"? Los saldos se recalculan.`} className="md:col-span-2">
              <input type="hidden" name="id" value={row.id} />
              <SubmitButton variant="danger" className="px-0">
                Borrar movimiento
              </SubmitButton>
            </ActionForm>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
