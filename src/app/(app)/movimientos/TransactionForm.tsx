'use client';

import { useState } from 'react';
import { createTransactionAction } from '@/server/actions/movements';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { Field } from '@/components/ui';
import { today } from '@/lib/dates';

interface Props {
  accounts: Array<{ id: string; name: string; currency: string; type: string }>;
  categories: Array<{ id: string; name: string; kind: 'expense' | 'income'; icon: string | null }>;
}

export function TransactionForm({ accounts, categories }: Props) {
  const [type, setType] = useState<'expense' | 'income' | 'transfer'>('expense');
  const cats = categories.filter((c) => c.kind === type);

  return (
    <ActionForm action={createTransactionAction} className="space-y-4">
      <fieldset className="flex gap-2" aria-label="Tipo de movimiento">
        {(
          [
            ['expense', 'Gasto'],
            ['income', 'Ingreso'],
            ['transfer', 'Transferencia'],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm ${type === value ? 'border-ledger bg-ledger-tint text-ledger' : 'border-rule-strong text-ink-soft'}`}
          >
            <input type="radio" name="type" value={value} checked={type === value} onChange={() => setType(value)} className="sr-only" />
            {label}
          </label>
        ))}
      </fieldset>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Monto">
          <input name="amount" required inputMode="decimal" placeholder="25.000" className="field num" />
        </Field>
        <Field label="Fecha">
          <input name="date" type="date" defaultValue={today()} className="field" />
        </Field>
        <Field label={type === 'transfer' ? 'Desde' : type === 'income' ? 'Cuenta que recibe' : 'Pagado con'}>
          <select name="accountId" required className="field">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </Field>
        {type === 'transfer' ? (
          <Field label="Hacia" hint="Para pagar una tarjeta, elige la tarjeta aquí.">
            <select name="toAccountId" required className="field" defaultValue={accounts[1]?.id}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Categoría" hint="Si la dejas en automático, se elige por la descripción.">
            <select name="categoryId" className="field" defaultValue="">
              <option value="">Automática</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Descripción" className="md:col-span-2">
          <input name="description" required maxLength={200} placeholder={type === 'income' ? 'Salario octubre' : 'Mercado en el Éxito'} className="field" />
        </Field>
      </div>
      <Field label="Notas (opcional)">
        <input name="notes" maxLength={1000} className="field" />
      </Field>
      <SubmitButton>Guardar movimiento</SubmitButton>
    </ActionForm>
  );
}
