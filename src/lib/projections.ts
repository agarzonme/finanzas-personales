/**
 * Proyecciones financieras (funciones puras, probadas en test/projections.test.ts).
 * En Colombia las tasas se expresan como Efectiva Anual (EA). Para trabajar mes a mes
 * se convierte a tasa mensual equivalente: i_m = (1 + EA)^(1/12) − 1.
 */
import { addMonths } from './dates';

export function monthlyRateFromEA(ea: number): number {
  return Math.pow(1 + ea, 1 / 12) - 1;
}

/**
 * ¿Cuántos meses faltan para llegar a la meta aportando `monthly` cada mes con un
 * rendimiento `ea`? Devuelve null si nunca llegas (sin aportes ni rendimiento).
 */
export function monthsToReach(current: number, target: number, monthly: number, ea = 0): number | null {
  if (current >= target) return 0;
  const r = monthlyRateFromEA(ea);
  if (monthly <= 0 && (r <= 0 || current <= 0)) return null;
  if (r === 0) return Math.ceil((target - current) / monthly);
  // Valor futuro: FV = C·(1+r)^n + A·((1+r)^n − 1)/r  →  despejamos n.
  const numerator = target * r + monthly;
  const denominator = current * r + monthly;
  if (denominator <= 0) return null;
  const n = Math.log(numerator / denominator) / Math.log(1 + r);
  return Number.isFinite(n) ? Math.max(0, Math.ceil(n - 1e-9)) : null;
}

/** Aporte mensual necesario para llegar a `target` en `months` meses (fórmula de anualidad). */
export function requiredMonthly(current: number, target: number, months: number, ea = 0): number {
  if (current >= target) return 0;
  if (months <= 0) return target - current;
  const r = monthlyRateFromEA(ea);
  if (r === 0) return (target - current) / months;
  const growth = Math.pow(1 + r, months);
  return Math.max(0, ((target - current * growth) * r) / (growth - 1));
}

export interface GoalProjection {
  pct: number;
  monthsLeft: number | null;
  projectedDate: string | null;
  monthlyNeeded: number | null;
  onTrack: boolean | null;
}

export function projectGoal(args: {
  current: number;
  target: number;
  monthly: number;
  ea: number;
  today: string;
  targetDate: string | null;
}): GoalProjection {
  const { current, target, monthly, ea, today, targetDate } = args;
  const pct = target > 0 ? Math.min(1, Math.max(0, current / target)) : 0;
  const monthsLeft = monthsToReach(current, target, monthly, ea);
  const projectedDate = monthsLeft == null ? null : addMonths(today, monthsLeft);
  let monthlyNeeded: number | null = null;
  let onTrack: boolean | null = null;
  if (targetDate) {
    const [y1, m1] = today.split('-').map(Number) as [number, number];
    const [y2, m2] = targetDate.split('-').map(Number) as [number, number];
    const months = Math.max(0, (y2 - y1) * 12 + (m2 - m1));
    monthlyNeeded = requiredMonthly(current, target, months, ea);
    onTrack = current >= target || (projectedDate != null && projectedDate <= targetDate);
  }
  return { pct, monthsLeft, projectedDate, monthlyNeeded, onTrack };
}

export interface PayoffProjection {
  months: number | null; // null = con ese pago la deuda nunca baja
  payoffDate: string | null;
  totalInterest: number | null;
  minimumToCoverInterest: number;
}

/** Meses para pagar una deuda de saldo `balance` con tasa `ea` pagando `payment` al mes. */
export function projectPayoff(balance: number, ea: number, payment: number, today: string): PayoffProjection {
  const r = monthlyRateFromEA(ea);
  const minimumToCoverInterest = balance * r;
  if (balance <= 0) return { months: 0, payoffDate: today, totalInterest: 0, minimumToCoverInterest: 0 };
  if (payment <= minimumToCoverInterest + 1e-9) return { months: null, payoffDate: null, totalInterest: null, minimumToCoverInterest };
  let months: number;
  if (r === 0) months = Math.ceil(balance / payment);
  else months = Math.ceil(-Math.log(1 - (r * balance) / payment) / Math.log(1 + r) - 1e-9);
  // Interés total simulando mes a mes (el último pago es menor).
  let b = balance;
  let interest = 0;
  for (let i = 0; i < months && b > 0; i++) {
    const int = b * r;
    interest += int;
    b = b + int - payment;
  }
  return { months, payoffDate: addMonths(today, months), totalInterest: Math.max(0, interest), minimumToCoverInterest };
}
