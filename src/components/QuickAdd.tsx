'use client';

import { useRef } from 'react';
import { quickAddAction } from '@/server/actions/movements';
import { ActionForm, SubmitButton } from './ActionForm';

const EXAMPLES = [
  'Gasté 25.000 en almuerzo',
  'Pagué 120.000 de la tarjeta',
  'Recibí salario por 4.000.000',
  'Pasé 2.000.000 de Bancolombia a Hapi',
  'Compré 2 VOO a 510 USD',
  'Ahorré 300.000 para el viaje',
  'Ayer gasté 18.000 en café con Nu',
];

/** Línea de registro rápido: escribes como le hablarías a alguien y queda anotado. */
export function QuickAdd({ autoFocus = false }: { autoFocus?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <ActionForm action={quickAddAction} className="mb-8" onSuccess={() => input.current?.focus()}>
      <label htmlFor="quick" className="mb-2 block text-sm text-ink-soft">
        Anota un movimiento como lo dirías
      </label>
      <div className="flex gap-2">
        <input
          ref={input}
          id="quick"
          name="text"
          required
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint="send"
          maxLength={200}
          placeholder="Gasté 25.000 en almuerzo con Nu"
          className="min-h-12 w-full border-0 border-b-2 border-ledger bg-transparent px-1 font-serif text-lg placeholder:text-ink-soft/70 focus:outline-none focus-visible:rounded-none focus-visible:border-blue focus-visible:outline-none"
        />
        <SubmitButton className="min-h-12 shrink-0">Anotar</SubmitButton>
      </div>
      <details className="mt-2 text-sm text-ink-soft">
        <summary className="cursor-pointer">Qué puedo escribir</summary>
        <ul className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <li key={e}>
              <button
                type="button"
                className="rounded-full border border-rule px-3 py-1 hover:border-ledger hover:text-ink"
                onClick={() => {
                  if (input.current) {
                    input.current.value = e;
                    input.current.focus();
                  }
                }}
              >
                {e}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2">
          Menciona la cuenta («con Nu», «en efectivo», «de Bancolombia a Hapi») o se usa la cuenta por defecto. Fechas: «ayer», «el
          3/10», «20 de diciembre». Montos: 25.000 · 25k · 25 mil · 1,5 millones · 500 USD.
        </p>
      </details>
    </ActionForm>
  );
}
