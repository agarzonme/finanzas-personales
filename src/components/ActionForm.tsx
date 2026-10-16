'use client';

import { createContext, startTransition, useActionState, useContext, useEffect, useRef } from 'react';
import type { ActionState } from '@/server/actions/shared';

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const PendingContext = createContext(false);

export function SubmitButton({
  children,
  variant = 'primary',
  className = '',
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'quiet' | 'danger';
  className?: string;
}) {
  const pending = useContext(PendingContext);
  const styles = {
    primary: 'bg-ledger text-sheet hover:opacity-90',
    quiet: 'border border-rule-strong text-ink hover:bg-ledger-tint',
    danger: 'text-red hover:bg-red-tint',
  }[variant];
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex min-h-10 items-center justify-center rounded-md px-4 text-sm font-medium disabled:opacity-60 ${styles} ${className}`}
    >
      {pending ? 'Guardando…' : children}
    </button>
  );
}

export function ActionMessage({ state }: { state: ActionState }) {
  if (state.status === 'idle' || !state.message) return null;
  const ok = state.status === 'success';
  return (
    <div role="status" aria-live="polite" className="mt-3 space-y-1 text-sm">
      <p className={ok ? 'text-ledger' : 'text-red'}>{state.message}</p>
      {state.warning ? <p className="rounded-md bg-amber-tint px-3 py-2 text-amber">{state.warning}</p> : null}
    </div>
  );
}

/**
 * Formulario conectado a una acción del servidor.
 * - Muestra el resultado (éxito, error o alerta de presupuesto) debajo.
 * - Limpia los campos solo si se guardó bien: si hay error, conservas lo que escribiste.
 * - Con `confirm`, pide confirmación antes de enviar (para borrar).
 */
export function ActionForm({
  action,
  children,
  className = '',
  confirm,
  hideSuccess = false,
  resetOnSuccess = true,
  onSuccess,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  hideSuccess?: boolean;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
}) {
  const [state, dispatch, pending] = useActionState(action, { status: 'idle' });
  const form = useRef<HTMLFormElement>(null);
  const lastAt = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state.status === 'success' && state.at !== lastAt.current) {
      lastAt.current = state.at;
      if (resetOnSuccess) form.current?.reset();
      onSuccess?.();
    }
  }, [state, onSuccess, resetOnSuccess]);

  return (
    <PendingContext.Provider value={pending}>
      <form
        ref={form}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          if (confirm && !window.confirm(confirm)) return;
          const fd = new FormData(e.currentTarget);
          startTransition(() => dispatch(fd));
        }}
      >
        {children}
        {hideSuccess && state.status === 'success' ? null : <ActionMessage state={state} />}
      </form>
    </PendingContext.Provider>
  );
}
