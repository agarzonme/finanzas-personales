// Fechas como texto AAAA-MM-DD en hora de Colombia. Para llevar cuentas basta la fecha:
// sin horas evitas el clásico error de que un gasto de las 9 p. m. caiga en el día siguiente (UTC).
export const APP_TZ = 'America/Bogota';

export function today(tz = APP_TZ, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function currentMonth(tz = APP_TZ): string {
  return today(tz).slice(0, 7);
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isMonthKey(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

export function shiftMonth(month: string, n: number): string {
  return addMonths(`${month}-01`, n).slice(0, 7);
}

/** Primer día del mes y primer día del mes siguiente: [start, end). */
export function monthRange(month: string): { start: string; end: string } {
  return { start: `${month}-01`, end: `${shiftMonth(month, 1)}-01` };
}

export function monthsBetween(fromDate: string, toDate: string): number {
  const [y1, m1] = fromDate.split('-').map(Number) as [number, number];
  const [y2, m2] = toDate.split('-').map(Number) as [number, number];
  return (y2 - y1) * 12 + (m2 - m1);
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-10" → "oct 2026" */
export function monthLabel(month: string, long = false): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${(long ? MONTHS_LONG : MONTHS)[m - 1]} ${y}`;
}

/** "2026-10-14" → "14 oct 2026" */
export function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function monthIndex(name: string): number | null {
  const i = MONTHS_LONG.findIndex((m) => m.startsWith(name.slice(0, 3)));
  return i >= 0 ? i + 1 : null;
}
