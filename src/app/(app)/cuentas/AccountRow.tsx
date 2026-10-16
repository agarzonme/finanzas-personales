'use client';

import Link from 'next/link';
import { useState } from 'react';
import { archiveAccountAction, deleteAccountAction, reconcileAction, updateAccountAction } from '@/server/actions/accounts';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { Field, Money } from '@/components/ui';
import { ACCOUNT_TYPE_LABEL } from '@/lib/constants';
import type { AccountWithBalance } from '@/server/services/accounts';

export function AccountRow({ account: a, investedBaseMinor }: { account: AccountWithBalance; investedBaseMinor: number | null }) {
  const [open, setOpen] = useState(false);
  const foreign = a.currency !== 'COP';

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-4">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="min-w-0 text-left">
          <span className="block font-medium">{a.name}</span>
          <span className="block text-xs text-ink-soft">
            {ACCOUNT_TYPE_LABEL[a.type]}
            {a.institution ? `, ${a.institution}` : ''}
            {a.aliases.length ? `. Registro rápido: ${a.aliases.join(', ')}` : ''}
          </span>
        </button>
        <div className="shrink-0 text-right">
          <Money minor={a.isLiability ? a.balanceMinor : a.balanceMinor} currency={a.currency} className="font-serif text-lg" />
          {foreign ? (
            <span className="block text-xs text-ink-soft">
              ≈ <Money minor={a.balanceBaseMinor} tone="neutral" />
            </span>
          ) : null}
          {investedBaseMinor ? (
            <span className="block text-xs text-ink-soft">
              + <Money minor={investedBaseMinor} tone="neutral" /> invertido
            </span>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="mt-3 grid gap-6 rounded-md border border-rule bg-sheet p-4 md:grid-cols-2">
          <ActionForm action={reconcileAction} className="space-y-2">
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="type" value={a.type} />
            <Field label={a.isLiability ? 'Ajustar a lo que debes hoy' : 'Ajustar al saldo real'} hint="Crea un movimiento «Ajuste de saldo» por la diferencia.">
              <input name="actual" required inputMode="decimal" placeholder={a.currency === 'COP' ? '1.250.000' : '320,50'} className="field num" />
            </Field>
            <SubmitButton variant="quiet">Ajustar saldo</SubmitButton>
          </ActionForm>

          <ActionForm action={updateAccountAction} resetOnSuccess={false} className="space-y-2">
            <input type="hidden" name="id" value={a.id} />
            <Field label="Nombre">
              <input name="name" defaultValue={a.name} required className="field" />
            </Field>
            <Field label="Cómo la llamas (separado por coma)">
              <input name="aliases" defaultValue={a.aliases.join(', ')} className="field" />
            </Field>
            <input type="hidden" name="institution" value={a.institution ?? ''} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="includeInNetWorth" defaultChecked={a.includeInNetWorth} /> Sumar al patrimonio
            </label>
            <SubmitButton variant="quiet">Guardar</SubmitButton>
          </ActionForm>

          <div className="flex flex-wrap items-center gap-4 text-sm md:col-span-2">
            <Link href={`/movimientos?account=${a.id}&month=all`} className="text-ledger hover:underline">
              Ver sus movimientos
            </Link>
            <ActionForm action={archiveAccountAction}>
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="archived" value={a.archived ? 'false' : 'true'} />
              <SubmitButton variant="quiet">{a.archived ? 'Restaurar' : 'Archivar'}</SubmitButton>
            </ActionForm>
            <ActionForm action={deleteAccountAction} confirm={`¿Borrar la cuenta "${a.name}"? Solo se puede si no tiene movimientos.`}>
              <input type="hidden" name="id" value={a.id} />
              <SubmitButton variant="danger">Borrar</SubmitButton>
            </ActionForm>
          </div>
        </div>
      ) : null}
    </li>
  );
}
