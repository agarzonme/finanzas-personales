'use client';

import { useActionState } from 'react';
import { loginAction } from '@/server/actions/auth';

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, { status: 'idle' });
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block text-ink-soft">Contraseña</span>
        <input name="password" type="password" required autoFocus autoComplete="current-password" className="field" />
      </label>
      {state.status === 'error' ? (
        <p role="alert" className="text-sm text-red">
          {state.message}
        </p>
      ) : null}
      <button disabled={pending} className="min-h-11 w-full rounded-md bg-ledger text-sm font-medium text-sheet disabled:opacity-60">
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
