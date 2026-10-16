import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { authEnabled } from '@/server/session';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Entrar' };

export default async function LoginPage() {
  await connection(); // se decide en cada visita, no al compilar
  if (!authEnabled()) redirect('/');
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 font-serif text-3xl">Mis finanzas</h1>
      <p className="mb-8 text-ink-soft">Escribe tu contraseña para ver tus cuentas.</p>
      <LoginForm />
    </main>
  );
}
