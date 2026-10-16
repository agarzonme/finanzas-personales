/**
 * Inversiones registradas a mano (Hapi, IBKR o cualquier broker).
 * - Una compra baja el efectivo de la cuenta del broker y suma la posición.
 * - Las posiciones se calculan con costo promedio a partir de las compras y ventas.
 * - El valor de mercado usa el último precio que registres (o el de la última operación).
 */
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import type { Db, DbOrTx } from '../db/connect';
import { accounts, categories, prices, securities, trades, transactions } from '../db/schema';
import type { AssetClass } from '@/lib/constants';
import { addMonths } from '@/lib/dates';
import { convertMinor, toMinor } from '@/lib/money';
import { AppError } from '../errors';
import { requireAccount } from './accounts';
import { latestRates } from './fx';
import { createTransactionIn } from './ledger';

export interface TradeInput {
  accountId: string;
  symbol: string;
  name?: string | null;
  assetClass?: AssetClass;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  feesMinor?: number;
  date: string;
}

export async function ensureSecurity(db: DbOrTx, symbol: string, currency: string, assetClass: AssetClass = 'etf', name?: string | null) {
  const sym = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,15}$/.test(sym)) throw new AppError('Símbolo inválido (ejemplo: VOO, AAPL, BRK.B).');
  const [found] = await db.select().from(securities).where(eq(securities.symbol, sym));
  if (found) return found;
  const [row] = await db.insert(securities).values({ symbol: sym, currency, assetClass, name: name || null }).returning();
  return row!;
}

export async function createTrade(db: Db, input: TradeInput) {
  if (!(input.quantity > 0) || !(input.price > 0)) throw new AppError('Cantidad y precio deben ser mayores que cero.');
  return db.transaction(async (tx) => {
    const account = await requireAccount(tx, input.accountId);
    if (account.type !== 'brokerage') throw new AppError('Las compras y ventas se registran en una cuenta de tipo Inversiones (broker).');
    const security = await ensureSecurity(tx, input.symbol, account.currency, input.assetClass, input.name);

    if (input.side === 'sell') {
      const held = (await computePositions(tx, account.id)).find((p) => p.securityId === security.id)?.quantity ?? 0;
      if (input.quantity > held + 1e-9) throw new AppError(`Solo tienes ${held} ${security.symbol} en ${account.name}.`);
    }

    const gross = toMinor(input.quantity * input.price);
    const fees = input.feesMinor ?? 0;
    const cash = input.side === 'buy' ? gross + fees : gross - fees;
    if (cash <= 0) throw new AppError('Las comisiones no pueden ser mayores que el valor de la venta.');

    const verb = input.side === 'buy' ? 'Compra' : 'Venta';
    const txId = await createTransactionIn(tx, {
      type: 'trade',
      date: input.date,
      accountId: account.id,
      amountMinor: cash,
      description: `${verb} ${input.quantity} ${security.symbol} @ ${input.price}`,
      direction: input.side === 'buy' ? -1 : 1,
      source: 'manual',
    });
    await tx.insert(trades).values({
      accountId: account.id,
      securityId: security.id,
      side: input.side,
      quantity: input.quantity,
      price: input.price,
      feesMinor: fees,
      date: input.date,
      transactionId: txId,
    });
    if (!security.lastPriceDate || input.date >= security.lastPriceDate) {
      await tx.update(securities).set({ lastPrice: input.price, lastPriceDate: input.date }).where(eq(securities.id, security.id));
    }
    return txId;
  });
}

export async function updatePrice(db: DbOrTx, securityId: string, price: number, date: string) {
  if (!(price > 0)) throw new AppError('El precio debe ser mayor que cero.');
  const [sec] = await db.select().from(securities).where(eq(securities.id, securityId));
  if (!sec) throw new AppError('El activo no existe.');
  await db.insert(prices).values({ securityId, date, price }).onConflictDoUpdate({ target: [prices.securityId, prices.date], set: { price } });
  if (!sec.lastPriceDate || date >= sec.lastPriceDate) {
    await db.update(securities).set({ lastPrice: price, lastPriceDate: date }).where(eq(securities.id, securityId));
  }
}

export interface Position {
  accountId: string;
  accountName: string;
  securityId: string;
  symbol: string;
  name: string | null;
  assetClass: AssetClass;
  currency: string;
  quantity: number;
  costMinor: number; // costo promedio total (incluye comisiones de compra)
  price: number;
  priceDate: string | null;
  valueMinor: number;
  valueBaseMinor: number | null;
  costBaseMinor: number | null;
  pnlMinor: number;
  pnlPct: number | null;
}

export async function computePositions(db: DbOrTx, accountId?: string): Promise<Position[]> {
  const rows = await db
    .select({
      accountId: trades.accountId,
      accountName: accounts.name,
      securityId: trades.securityId,
      symbol: securities.symbol,
      name: securities.name,
      assetClass: securities.assetClass,
      currency: securities.currency,
      lastPrice: securities.lastPrice,
      lastPriceDate: securities.lastPriceDate,
      side: trades.side,
      quantity: trades.quantity,
      price: trades.price,
      feesMinor: trades.feesMinor,
    })
    .from(trades)
    .innerJoin(securities, eq(securities.id, trades.securityId))
    .innerJoin(accounts, eq(accounts.id, trades.accountId))
    .where(accountId ? eq(trades.accountId, accountId) : undefined)
    .orderBy(trades.date, trades.createdAt);

  const rates = await latestRates(db);
  const map = new Map<string, Position & { lastTradePrice: number }>();
  for (const r of rows) {
    const key = `${r.accountId}:${r.securityId}`;
    let p = map.get(key);
    if (!p) {
      p = {
        accountId: r.accountId,
        accountName: r.accountName,
        securityId: r.securityId,
        symbol: r.symbol,
        name: r.name,
        assetClass: r.assetClass,
        currency: r.currency,
        quantity: 0,
        costMinor: 0,
        price: r.lastPrice ?? r.price,
        priceDate: r.lastPriceDate,
        valueMinor: 0,
        valueBaseMinor: null,
        costBaseMinor: null,
        pnlMinor: 0,
        pnlPct: null,
        lastTradePrice: r.price,
      };
      map.set(key, p);
    }
    if (r.side === 'buy') {
      p.costMinor += toMinor(r.quantity * r.price) + r.feesMinor;
      p.quantity += r.quantity;
    } else {
      const avg = p.quantity > 0 ? p.costMinor / p.quantity : 0;
      p.costMinor -= Math.round(avg * r.quantity);
      p.quantity -= r.quantity;
    }
    p.lastTradePrice = r.price;
  }

  const out: Position[] = [];
  for (const p of map.values()) {
    if (p.quantity <= 1e-9) continue;
    const price = p.price || p.lastTradePrice;
    const valueMinor = toMinor(p.quantity * price);
    const rate = rates.get(p.currency);
    out.push({
      ...p,
      quantity: Math.round(p.quantity * 1e8) / 1e8,
      price,
      valueMinor,
      valueBaseMinor: rate == null ? null : convertMinor(valueMinor, rate),
      costBaseMinor: rate == null ? null : convertMinor(p.costMinor, rate),
      pnlMinor: valueMinor - p.costMinor,
      pnlPct: p.costMinor > 0 ? (valueMinor - p.costMinor) / p.costMinor : null,
    });
  }
  return out.sort((a, b) => (b.valueBaseMinor ?? 0) - (a.valueBaseMinor ?? 0));
}

export async function listSecurities(db: DbOrTx) {
  return db.select().from(securities).orderBy(securities.symbol);
}

export async function recentTrades(db: DbOrTx, limit = 20) {
  return db
    .select({
      id: trades.id,
      date: trades.date,
      side: trades.side,
      quantity: trades.quantity,
      price: trades.price,
      feesMinor: trades.feesMinor,
      symbol: securities.symbol,
      currency: securities.currency,
      accountName: accounts.name,
      transactionId: trades.transactionId,
    })
    .from(trades)
    .innerJoin(securities, eq(securities.id, trades.securityId))
    .innerJoin(accounts, eq(accounts.id, trades.accountId))
    .orderBy(desc(trades.date), desc(trades.createdAt))
    .limit(limit);
}

/** Dividendos y rendimientos de los últimos 12 meses (ingresos en la categoría de rendimientos). */
export async function dividendsLast12m(db: DbOrTx, today: string): Promise<number> {
  const since = addMonths(today, -12);
  const cats = await db.select({ id: categories.id }).from(categories).where(eq(categories.name, 'Rendimientos y dividendos'));
  if (!cats.length) return 0;
  const rows = await db
    .select({ amount: transactions.amountBaseMinor })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, 'income'),
        inArray(
          transactions.categoryId,
          cats.map((c) => c.id),
        ),
        gte(transactions.date, since),
      ),
    );
  return rows.reduce((s, r) => s + r.amount, 0);
}
