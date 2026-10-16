import 'server-only';
import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { AppError } from '../errors';
import { requireAuth } from '../auth';
import { isIsoDate, isMonthKey, today } from '@/lib/dates';
import { parseAmount, toMinor } from '@/lib/money';

export interface ActionState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  warning?: string | null;
  at?: number; // marca de tiempo para que la interfaz detecte respuestas nuevas
}

export const idle: ActionState = { status: 'idle' };

/**
 * Envoltura de todas las acciones: verifica la sesión, ejecuta, refresca la interfaz
 * y convierte los errores en mensajes legibles (sin filtrar detalles internos).
 */
export async function run(fn: () => Promise<string | { message: string; warning?: string | null }>): Promise<ActionState> {
  try {
    await requireAuth({ redirectToLogin: false });
    const out = await fn();
    revalidatePath('/', 'layout');
    return typeof out === 'string'
      ? { status: 'success', message: out, at: Date.now() }
      : { status: 'success', message: out.message, warning: out.warning ?? null, at: Date.now() };
  } catch (err) {
    unstable_rethrow(err); // deja pasar las redirecciones internas de Next
    if (err instanceof AppError || err instanceof FormError) return { status: 'error', message: err.message, at: Date.now() };
    console.error(err);
    return { status: 'error', message: 'Algo falló al guardar. Revisa los datos e inténtalo de nuevo.', at: Date.now() };
  }
}

export class FormError extends Error {}

// ---------- lectura de formularios ----------

export function text(fd: FormData, name: string, label: string, opts: { max?: number } = {}): string {
  const v = String(fd.get(name) ?? '').trim();
  if (!v) throw new FormError(`Falta ${label}.`);
  if (opts.max && v.length > opts.max) throw new FormError(`${label} es demasiado largo (máximo ${opts.max} caracteres).`);
  return v;
}

export function optText(fd: FormData, name: string): string | null {
  const v = String(fd.get(name) ?? '').trim();
  return v || null;
}

export function oneOf<T extends string>(fd: FormData, name: string, values: readonly T[], label: string): T {
  const v = String(fd.get(name) ?? '');
  if (!values.includes(v as T)) throw new FormError(`Elige ${label}.`);
  return v as T;
}

/** Monto en centavos. Acepta "25.000", "25000", "1.234,56", "12.50". */
export function money(fd: FormData, name: string, label: string, opts: { allowZero?: boolean; allowNegative?: boolean } = {}): number {
  const raw = String(fd.get(name) ?? '').trim();
  if (!raw) {
    if (opts.allowZero) return 0;
    throw new FormError(`Falta ${label}.`);
  }
  const parsed = parseAmount(raw);
  if (!parsed) throw new FormError(`${label}: no entendí "${raw}". Escribe por ejemplo 25.000 o 12,50.`);
  const minor = toMinor(parsed);
  if (minor < 0 && !opts.allowNegative) throw new FormError(`${label} no puede ser negativo.`);
  if (minor === 0 && !opts.allowZero) throw new FormError(`${label} debe ser mayor que cero.`);
  return minor;
}

export function optMoney(fd: FormData, name: string, label: string): number | null {
  const raw = String(fd.get(name) ?? '').trim();
  return raw ? money(fd, name, label) : null;
}

export function decimal(fd: FormData, name: string, label: string): number {
  const parsed = parseAmount(String(fd.get(name) ?? ''));
  const n = parsed ? Number(parsed) : NaN;
  if (!(n > 0)) throw new FormError(`${label} debe ser un número mayor que cero.`);
  return n;
}

/** Porcentaje escrito como "28,5" → 0.285. */
export function percent(fd: FormData, name: string, label: string): number {
  const raw = String(fd.get(name) ?? '').trim();
  if (!raw) return 0;
  const parsed = parseAmount(raw.replace('%', ''));
  const n = parsed ? Number(parsed) : NaN;
  if (!(n >= 0) || n > 200) throw new FormError(`${label}: escribe un porcentaje entre 0 y 200.`);
  return n / 100;
}

export function date(fd: FormData, name: string): string {
  const v = String(fd.get(name) ?? '').trim();
  if (!v) return today();
  if (!isIsoDate(v)) throw new FormError('Fecha inválida.');
  return v;
}

export function optDate(fd: FormData, name: string): string | null {
  const v = String(fd.get(name) ?? '').trim();
  if (!v) return null;
  if (!isIsoDate(v)) throw new FormError('Fecha inválida.');
  return v;
}

export function month(fd: FormData, name: string): string {
  const v = String(fd.get(name) ?? '').trim();
  if (!isMonthKey(v)) throw new FormError('Mes inválido.');
  return v;
}

export function id(fd: FormData, name: string, label = 'el registro'): string {
  const v = String(fd.get(name) ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(v)) throw new FormError(`Elige ${label}.`);
  return v;
}

export function optId(fd: FormData, name: string): string | null {
  const v = String(fd.get(name) ?? '');
  return /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

export function int(fd: FormData, name: string, min: number, max: number): number | null {
  const v = String(fd.get(name) ?? '').trim();
  if (!v) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new FormError(`Escribe un número entre ${min} y ${max}.`);
  return n;
}
