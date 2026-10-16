/**
 * Dinero en ENTEROS de centavos ("minor units"): $ 25.000 COP se guarda como 2500000.
 * Sumar enteros es exacto; sumar decimales en JavaScript no (0,1 + 0,2 = 0,30000000000000004).
 * Solo se convierte a decimal al mostrar.
 */

/**
 * Lee un monto escrito a la colombiana o a la gringa y devuelve un decimal normalizado ("25000.5").
 * Acepta: "25.000", "25000", "$25.000,50", "1.234.567", "12.50", "12,5", "4'000.000".
 * Regla para el punto/coma único: si le siguen exactamente 3 dígitos es separador de miles,
 * si le siguen 1 o 2 es decimal.
 */
export function parseAmount(input: string): string | null {
  let s = input.trim().replace(/[$\s']/g, '').replace(/^(cop|usd|us|eur)/i, '');
  if (!s) return null;
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;

  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  let intPart = s;
  let frac = '';

  if (dots > 0 && commas > 0) {
    // El último separador que aparece es el decimal: "25.000,50" o "25,000.50".
    const decSep = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const thouSep = decSep === ',' ? '.' : ',';
    const [a, b = ''] = s.split(decSep);
    intPart = (a ?? '').split(thouSep).join('');
    frac = b;
    if (s.split(decSep).length > 2) return null;
  } else if (dots + commas === 1) {
    const sep = dots ? '.' : ',';
    const [a = '', b = ''] = s.split(sep);
    if (b.length === 3) {
      intPart = a + b; // "25.000" → 25000
    } else {
      intPart = a;
      frac = b; // "12.50" → 12.50
    }
  } else if (dots + commas > 1) {
    const sep = dots ? '.' : ',';
    if (dots && commas) return null;
    const groups = s.split(sep);
    // "1.234.567" válido; "1.23.4" no.
    if (!groups.slice(1).every((g) => g.length === 3)) return null;
    intPart = groups.join('');
  }

  if (!/^\d+$/.test(intPart) || (frac && !/^\d+$/.test(frac))) return null;
  intPart = intPart.replace(/^0+(?=\d)/, '');
  const value = frac ? `${intPart}.${frac}` : intPart;
  return negative ? `-${value}` : value;
}

/** "25000.505" → 2500051 (redondeo a 2 decimales, mitad hacia arriba, sin floats). */
export function toMinor(decimal: string | number): number {
  const str = typeof decimal === 'number' ? decimal.toFixed(6) : decimal.trim();
  if (!/^-?\d+(\.\d+)?$/.test(str)) throw new Error(`Monto inválido: ${decimal}`);
  const negative = str.startsWith('-');
  const [i = '0', f = ''] = str.replace('-', '').split('.');
  const frac3 = (f + '000').slice(0, 3);
  let cents = BigInt(i) * 100n + BigInt(frac3.slice(0, 2));
  if (Number(frac3[2]) >= 5) cents += 1n;
  const n = Number(cents);
  if (!Number.isSafeInteger(n)) throw new Error('Monto demasiado grande');
  return negative ? -n : n;
}

/** 2500050 → 25000.5 (número, solo para mostrar o graficar). */
export function fromMinor(minor: number): number {
  return minor / 100;
}

/** 2500050 → "25000.50" (string exacto, para formularios). */
export function minorToDecimalString(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const s = `${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return negative ? `-${s}` : s;
}

/** Multiplica centavos por una tasa (p. ej. TRM) y redondea al centavo. */
export function convertMinor(minor: number, rate: number): number {
  return Math.round(minor * rate);
}

const inputFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2, useGrouping: true });
/** 15000000 centavos → "150.000" para prellenar un campo (parseAmount lo vuelve a leer igual). */
export function toInputValue(minor: number): string {
  return inputFormat.format(minor / 100);
}

/** Precio o cantidad decimal → "548,2" / "1.234,5". */
export function decimalToInput(value: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 8, useGrouping: true }).format(value);
}

const formatters = new Map<string, Intl.NumberFormat>();
function formatter(currency: string, compact: boolean) {
  const key = `${currency}-${compact}`;
  let f = formatters.get(key);
  if (!f) {
    const decimals = currency === 'COP' ? 0 : 2;
    f = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency,
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : decimals,
      minimumFractionDigits: compact ? 0 : decimals,
    });
    formatters.set(key, f);
  }
  return f;
}

/** 2500000 centavos COP → "$ 25.000"; 50000 centavos USD → "US$ 500,00". */
export function formatMoney(minor: number, currency = 'COP', opts: { compact?: boolean; signed?: boolean } = {}): string {
  const text = formatter(currency, Boolean(opts.compact)).format(fromMinor(minor));
  return opts.signed && minor > 0 ? `+${text}` : text;
}

export function formatPct(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('es-CO', { style: 'percent', maximumFractionDigits: digits }).format(value);
}

export function formatNumber(value: number, digits = 4): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: digits }).format(value);
}
