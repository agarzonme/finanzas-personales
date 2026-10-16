/**
 * Registro rápido en lenguaje natural, sin IA y sin costo.
 * Convierte frases como "Gasté 25.000 en almuerzo con Nu" en un movimiento estructurado.
 * Es determinístico: la misma frase siempre da el mismo resultado, y tiene pruebas en test/quickParse.test.ts.
 */
import { addDays, monthIndex } from './dates';
import { parseAmount } from './money';
import type { Currency } from './constants';

export type QuickIntent =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'card_payment'
  | 'goal_contribution'
  | 'investment_buy'
  | 'investment_sell';

export type HintRole = 'from' | 'to' | 'any';
export interface AccountHint {
  alias: string; // alias tal como lo conoce la app (normalizado)
  role: HintRole;
}

export interface QuickParseResult {
  ok: true;
  intent: QuickIntent;
  amount: string | null; // decimal; null solo en compras con cantidad y precio calculables
  currency: Currency | null; // null = la moneda de la cuenta
  description: string;
  date: string;
  hints: AccountHint[];
  goalHint: string | null;
  symbol: string | null;
  quantity: string | null;
  price: string | null;
}
export interface QuickParseError {
  ok: false;
  error: string;
}

export interface QuickParseOptions {
  today: string; // AAAA-MM-DD
  accountAliases?: string[]; // alias normalizados de tus cuentas: ["nu", "bancolombia", "efectivo", ...]
}

// ---------- utilidades ----------

/** Igual que normalize() pero conserva la longitud del texto para poder recortar el original. */
function fold(text: string): string {
  let out = '';
  for (const c of text) {
    const base = c.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    out += base.length === c.length ? base : c.toLowerCase().length === c.length ? c.toLowerCase() : c;
  }
  return out;
}

function blank(s: string, start: number, end: number): string {
  return s.slice(0, start) + ' '.repeat(end - start) + s.slice(end);
}

function shiftDecimal(decimal: string, zeros: number): string {
  const [i = '0', f = ''] = decimal.split('.');
  const digits = i + f.padEnd(zeros, '0');
  const intLen = i.length + zeros;
  const whole = digits.slice(0, intLen).replace(/^0+(?=\d)/, '');
  const rest = digits.slice(intLen).replace(/0+$/, '');
  return rest ? `${whole}.${rest}` : whole;
}

function mulDecimal(a: string, b: string): string {
  // Suficiente precisión para cantidad × precio (hasta 6 decimales).
  return (Math.round(Number(a) * Number(b) * 1e6) / 1e6).toString();
}

const MULTIPLIERS: Record<string, number> = {
  k: 3, mil: 3, luca: 3, lucas: 3,
  m: 6, mm: 6, millon: 6, millones: 6, palo: 6, palos: 6,
};

const CURRENCY_WORDS: Record<string, Currency | null> = {
  'us$': 'USD', usd: 'USD', dolar: 'USD', dolares: 'USD', dls: 'USD',
  cop: 'COP', pesos: 'COP',
  eur: 'EUR', euro: 'EUR', euros: 'EUR', '€': 'EUR',
  $: null,
};

const AMOUNT_RE =
  /(us\$|\$|usd|cop|eur|€)?\s?(\d+(?:[.,']\d+)*)\s?(millones|millon|mil|palos|palo|lucas|luca|mm|k|m)?(?![a-z0-9])\s?(usd|dolares|dolar|dls|cop|pesos|euros|euro|eur)?(?![a-z])/g;

const NOT_TICKERS = new Set(['USD', 'COP', 'EUR', 'US', 'TC', 'ETF', 'ATM', 'GMF', 'PSE', 'QR', 'IVA']);

const FROM_PREPS = new Set(['con', 'desde', 'de', 'del', 'usando', 'por']);
const TO_PREPS = new Set(['a', 'al', 'hacia', 'para', 'en']);
const ARTICLES = new Set(['la', 'el', 'mi', 'mis', 'los', 'las', 'tu']);

// ---------- intención ----------

function detectIntent(f: string, hasTicker: boolean): QuickIntent {
  const has = (re: RegExp) => re.test(f);
  if (hasTicker && has(/\b(vendi|vendo|venta)\b/)) return 'investment_sell';
  if (hasTicker && has(/\b(inverti|invierto|compre|compro|meti)\b/)) return 'investment_buy';
  if (has(/\b(pague|pago|abone|abono|cancele)\b/) && has(/\b(tarjeta|tc|credito|visa|mastercard|amex)\b/)) return 'card_payment';
  if (has(/\b(ahorre|ahorro|aparte|guarde)\b/)) return 'goal_contribution';
  if (has(/\b(transferi|transfiero|pase|paso|movi|retire|retiro|saque|envie|mande|consigne|inverti|invierto|meti|recargue)\b/))
    return 'transfer';
  if (
    has(/\b(recibi|recibo|me pagaron|me consignaron|me llego|me llegaron|me transfirieron|me depositaron|cobre|ingreso|ingresaron|gane)\b/) ||
    has(/^\s*(salario|sueldo|nomina|prima|honorarios)\b/)
  )
    return 'income';
  return 'expense';
}

const INTENT_VERBS =
  /\b(gaste|gasto|gastamos|pague|pago|compre|compro|me costo|costo|recibi|recibo|me pagaron|me consignaron|me llego|me llegaron|me transfirieron|me depositaron|cobre|ingreso|ingresaron|gane|transferi|transfiero|pase|paso|movi|retire|retiro|saque|envie|mande|consigne|inverti|invierto|meti|recargue|ahorre|ahorro|aparte|guarde|abone|abono|cancele|vendi|vendo)\b/g;

// ---------- fecha ----------

function extractDate(f: string, todayDate: string): { date: string; folded: string } {
  let folded = f;
  let date = todayDate;
  const rel: Array<[RegExp, number]> = [
    [/\b(anteayer|antier)\b/, -2],
    [/\bayer\b/, -1],
    [/\bhoy\b/, 0],
  ];
  for (const [re, days] of rel) {
    const m = re.exec(folded);
    if (m) {
      date = addDays(todayDate, days);
      folded = blank(folded, m.index, m.index + m[0].length);
      return { date, folded };
    }
  }
  const year = Number(todayDate.slice(0, 4));
  const build = (d: number, mo: number, y?: number) => {
    let yy = y ?? year;
    if (yy < 100) yy += 2000;
    let iso = `${yy}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!y && iso > todayDate) iso = `${yy - 1}${iso.slice(4)}`; // "el 30/12" escrito en enero = año pasado
    return iso;
  };
  const numeric = /\b(?:el\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(folded);
  if (numeric) {
    const d = Number(numeric[1]);
    const mo = Number(numeric[2]);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      date = build(d, mo, numeric[3] ? Number(numeric[3]) : undefined);
      folded = blank(folded, numeric.index, numeric.index + numeric[0].length);
      return { date, folded };
    }
  }
  const words = /\b(?:el\s+)?(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?: de (\d{4}))?\b/.exec(
    folded,
  );
  if (words) {
    const mo = monthIndex(words[2] === 'setiembre' ? 'septiembre' : (words[2] ?? ''));
    if (mo) {
      date = build(Number(words[1]), mo, words[3] ? Number(words[3]) : undefined);
      folded = blank(folded, words.index, words.index + words[0].length);
    }
  }
  return { date, folded };
}

// ---------- cuentas ----------

function extractHints(f: string, aliases: string[]): { hints: AccountHint[]; folded: string } {
  let folded = f;
  const hints: AccountHint[] = [];
  const sorted = [...new Set(aliases.filter((a) => a.length >= 2))].sort((a, b) => b.length - a.length);
  for (const alias of sorted) {
    const re = new RegExp(`(?:\\b(\\w+)\\s+)?(?:\\b(?:la|el|mi|mis|los|las|tu)\\s+)?\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    const m = re.exec(folded);
    if (!m) continue;
    const prep = m[1] && !ARTICLES.has(m[1]) ? m[1] : undefined;
    const role: HintRole = prep && FROM_PREPS.has(prep) ? 'from' : prep && TO_PREPS.has(prep) ? 'to' : 'any';
    hints.push({ alias, role });
    // Borra la preposición solo si es una preposición conocida (no la palabra anterior cualquiera).
    const start = prep && (FROM_PREPS.has(prep) || TO_PREPS.has(prep)) ? m.index : m.index + (m[1] ? m[1].length + 1 : 0);
    folded = blank(folded, start, m.index + m[0].length);
  }
  return { hints, folded };
}

// ---------- principal ----------

export function quickParse(text: string, opts: QuickParseOptions): QuickParseResult | QuickParseError {
  const original = text.replace(/\s+/g, ' ').trim();
  if (original.length < 3) return { ok: false, error: 'Escribe algo como "Gasté 25.000 en almuerzo".' };

  let folded = fold(original);
  const dateRes = extractDate(folded, opts.today);
  folded = dateRes.folded;

  // Ticker: palabra en MAYÚSCULAS de 1 a 5 letras en el texto original (VOO, AAPL, QQQ).
  let symbol: string | null = null;
  for (const m of original.matchAll(/\b[A-Z]{1,5}(?:\.[A-Z])?\b/g)) {
    if (!NOT_TICKERS.has(m[0]) && !(opts.accountAliases ?? []).includes(m[0].toLowerCase())) {
      symbol = m[0];
      folded = blank(folded, m.index, m.index + m[0].length);
      break;
    }
  }

  const intent = detectIntent(folded, Boolean(symbol));
  if ((intent === 'investment_buy' || intent === 'investment_sell') === false && symbol) {
    // Un ticker en una frase de gasto no es un ticker ("pagué el SOAT"): devuélvelo a la descripción.
    folded = fold(original);
    folded = extractDate(folded, opts.today).folded;
    symbol = null;
  }

  let quantity: string | null = null;
  let price: string | null = null;
  let amount: string | null = null;
  let currency: Currency | null = null;

  if (intent === 'investment_buy' || intent === 'investment_sell') {
    // "Compré 2,5 VOO a 512 USD" / "Vendí 3 acciones de AAPL a 230 dólares"
    const qtyMatch = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s+(?:acciones?\\s+(?:de\\s+)?)?${symbol}\\b`).exec(original);
    const priceMatch = /\b(?:a|por)\s+(us\$|\$)?\s?(\d+(?:[.,]\d+)*)\s?(usd|dolares|dólares|dls)?/i.exec(original);
    if (qtyMatch && priceMatch) {
      quantity = parseAmount(qtyMatch[1] ?? '');
      price = parseAmount(priceMatch[2] ?? '');
      if (quantity && price) {
        amount = mulDecimal(quantity, price);
        currency = priceMatch[1] || priceMatch[3] ? 'USD' : null;
      }
    }
  }

  if (!amount) {
    AMOUNT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = AMOUNT_RE.exec(folded))) {
      const raw = m[2] ?? '';
      const value = parseAmount(raw);
      if (!value || Number(value) === 0) continue;
      const mult = m[3] ? (MULTIPLIERS[m[3]] ?? 0) : 0;
      amount = mult ? shiftDecimal(value, mult) : value;
      const cur = m[1] ?? m[4];
      if (cur) currency = CURRENCY_WORDS[cur] ?? null;
      folded = blank(folded, m.index, m.index + m[0].length);
      break;
    }
  } else {
    // Ya usamos cantidad y precio; bórralos de la descripción.
    folded = folded.replace(/\d+(?:[.,']\d+)*/g, (s) => ' '.repeat(s.length));
  }

  if (!amount) return { ok: false, error: 'No encontré el monto. Ejemplo: "Gasté 25.000 en almuerzo".' };

  if (!currency) {
    if (/\b(usd|dolares|dolar|dls)\b/.test(folded)) currency = 'USD';
    else if (/\b(euros?|eur)\b/.test(folded)) currency = 'EUR';
  }
  folded = folded.replace(/\b(usd|dolares|dolar|dls|euros?|eur|cop|pesos)\b/g, (s) => ' '.repeat(s.length));

  const hintRes = extractHints(folded, opts.accountAliases ?? []);
  folded = hintRes.folded;

  // Meta: "Ahorré 200.000 para el viaje a Japón"
  let goalHint: string | null = null;
  if (intent === 'goal_contribution') {
    const g = /\b(?:para|en)\s+(?:el|la|mi|los|las)?\s*(.+)$/.exec(folded);
    if (g?.[1]?.trim()) {
      goalHint = g[1].trim();
      folded = blank(folded, g.index, folded.length);
    }
  }

  // Descripción = el texto original sin verbo, monto, fecha ni cuentas.
  folded = folded.replace(INTENT_VERBS, (s) => ' '.repeat(s.length));
  let description = '';
  for (let i = 0; i < original.length; i++) description += folded[i] === ' ' ? ' ' : original[i];
  description = description
    .replace(/\s+/g, ' ')
    .replace(/^(?:\s*\b(?:en|de|del|por|para|a|al|el|la|los|las|un|una|y|con|me|mi|acciones|accion)\b)+/i, '')
    .replace(/(?:\b(?:en|de|del|por|para|a|al|el|la|los|las|y|con)\b\s*)+$/i, '')
    .replace(/[,.;:]+$/, '')
    .trim();

  const defaults: Record<QuickIntent, string> = {
    expense: 'Gasto',
    income: 'Ingreso',
    transfer: 'Transferencia',
    card_payment: 'Pago de tarjeta',
    goal_contribution: 'Ahorro',
    investment_buy: `Compra ${symbol ?? ''}`.trim(),
    investment_sell: `Venta ${symbol ?? ''}`.trim(),
  };
  if (!description || intent === 'card_payment' || intent.startsWith('investment')) description = description || defaults[intent];
  if (intent === 'card_payment' && !/tarjeta/i.test(description)) description = defaults.card_payment;
  description = description.charAt(0).toUpperCase() + description.slice(1);

  return {
    ok: true,
    intent,
    amount,
    currency,
    description,
    date: dateRes.date,
    hints: hintRes.hints,
    goalHint,
    symbol,
    quantity,
    price,
  };
}
