/**
 * Registro rápido: toma una frase, la interpreta (src/lib/quickParse.ts) y la convierte
 * en el movimiento correcto usando tus cuentas, metas y cuentas por defecto.
 */
import { eq } from 'drizzle-orm';
import type { Db } from '../db/connect';
import { categories, goals, securities, settings, transactions } from '../db/schema';
import { dateLabel } from '@/lib/dates';
import { formatMoney, toMinor } from '@/lib/money';
import { quickParse } from '@/lib/quickParse';
import { normalize } from '@/lib/text';
import { AppError } from '../errors';
import { type AccountWithBalance, listAccountsWithBalances } from './accounts';
import { addContribution } from './goals';
import { createTrade } from './investments';
import { createTransaction } from './ledger';
import { budgetWarningFor } from './reports';

export interface QuickAddResult {
  message: string;
  warning: string | null;
  transactionId: string | null;
}

export async function quickAdd(db: Db, text: string, today: string): Promise<QuickAddResult> {
  const accs = (await listAccountsWithBalances(db)).filter((a) => !a.archived);
  const aliasMap = new Map<string, AccountWithBalance>();
  for (const a of accs) for (const al of [normalize(a.name), ...a.aliases]) if (!aliasMap.has(al)) aliasMap.set(al, a);

  const parsed = quickParse(text, { today, accountAliases: [...aliasMap.keys()] });
  if (!parsed.ok) throw new AppError(parsed.error);

  const [s] = await db.select().from(settings).where(eq(settings.id, 1));
  const byId = (id: string | null | undefined) => (id ? accs.find((a) => a.id === id) : undefined);
  const hinted = parsed.hints.map((h) => ({ ...h, account: aliasMap.get(h.alias)! })).filter((h) => h.account);
  const need = (a: AccountWithBalance | undefined, what: string) => {
    if (!a) throw new AppError(`No sé qué cuenta usar ${what}. Menciónala ("con Nu") o define una cuenta por defecto en Ajustes.`);
    return a;
  };
  const amountMinor = parsed.amount ? toMinor(parsed.amount) : 0;
  const money = (minor: number, cur: string) => formatMoney(minor, cur);
  const when = parsed.date === today ? 'hoy' : dateLabel(parsed.date);

  switch (parsed.intent) {
    case 'expense':
    case 'income': {
      const fallback = parsed.intent === 'expense' ? byId(s?.defaultExpenseAccountId) : byId(s?.defaultIncomeAccountId);
      const account = need(hinted[0]?.account ?? fallback, parsed.intent === 'expense' ? 'para el gasto' : 'para el ingreso');
      const currency = parsed.currency ?? account.currency;
      const id = await createTransaction(db, {
        type: parsed.intent,
        date: parsed.date,
        accountId: account.id,
        amountMinor,
        currency,
        description: parsed.description,
        source: 'quick',
      });
      const [row] = await db
        .select({ name: categories.name, id: categories.id })
        .from(transactions)
        .innerJoin(categories, eq(categories.id, transactions.categoryId))
        .where(eq(transactions.id, id));
      const cat = row?.name ?? 'sin categoría';
      const verb = parsed.intent === 'expense' ? 'Gasto' : 'Ingreso';
      return {
        message: `Anotado: ${verb.toLowerCase()} de ${money(amountMinor, currency)} en «${parsed.description}» (${cat}), ${account.name}, ${when}.`,
        warning: parsed.intent === 'expense' ? await budgetWarningFor(db, row?.id ?? null, parsed.date) : null,
        transactionId: id,
      };
    }

    case 'transfer':
    case 'card_payment': {
      let from: AccountWithBalance | undefined;
      let to: AccountWithBalance | undefined;
      if (parsed.intent === 'card_payment') {
        to = hinted.find((h) => h.account.type === 'credit_card')?.account ?? byId(s?.defaultCardAccountId);
        from = hinted.find((h) => h.account.type !== 'credit_card')?.account ?? byId(s?.defaultExpenseAccountId);
      } else {
        from = hinted.find((h) => h.role === 'from')?.account;
        to = hinted.find((h) => h.role === 'to' && h.account.id !== from?.id)?.account;
        if (!to) to = hinted.find((h) => h.role === 'any' && h.account.id !== from?.id)?.account;
        if (!to && /\b(retire|retiro|saque|cajero)\b/.test(normalize(text))) to = byId(s?.cashAccountId);
        if (!to && /\b(inverti|invierto|meti)\b/.test(normalize(text))) to = byId(s?.defaultInvestmentAccountId);
        from ??= byId(s?.defaultExpenseAccountId);
      }
      from = need(from, 'de origen');
      to = need(to, 'de destino');
      const currency = parsed.currency ?? from.currency;
      const id = await createTransaction(db, {
        type: 'transfer',
        date: parsed.date,
        accountId: from.id,
        toAccountId: to.id,
        amountMinor,
        currency,
        description: parsed.description,
        source: 'quick',
      });
      const what = parsed.intent === 'card_payment' ? 'Pago de tarjeta' : 'Transferencia';
      return { message: `Anotado: ${what.toLowerCase()} de ${money(amountMinor, currency)} de ${from.name} a ${to.name}, ${when}.`, warning: null, transactionId: id };
    }

    case 'goal_contribution': {
      const all = await db.select().from(goals).where(eq(goals.status, 'active'));
      const hint = parsed.goalHint ?? normalize(parsed.description);
      const goal =
        all.find((g) => normalize(g.name) === hint) ??
        all.find((g) => hint.includes(normalize(g.name)) || normalize(g.name).includes(hint)) ??
        all.find((g) => normalize(g.name).split(' ').some((w) => w.length > 3 && hint.includes(w)));
      if (!goal) {
        const names = all.map((g) => `"${g.name}"`).join(', ');
        throw new AppError(names ? `No encontré esa meta. Tus metas: ${names}.` : 'Primero crea una meta en la sección Metas.');
      }
      if (goal.accountId) {
        const from = need(hinted.find((h) => h.account.id !== goal.accountId)?.account ?? byId(s?.defaultExpenseAccountId), 'de origen');
        const id = await createTransaction(db, {
          type: 'transfer',
          date: parsed.date,
          accountId: from.id,
          toAccountId: goal.accountId,
          amountMinor,
          currency: parsed.currency ?? from.currency,
          description: `Ahorro: ${goal.name}`,
          goalId: goal.id,
          source: 'quick',
        });
        return { message: `Ahorro de ${money(amountMinor, goal.currency)} para "${goal.name}" (transferido desde ${from.name}).`, warning: null, transactionId: id };
      }
      await addContribution(db, goal.id, amountMinor, parsed.date, parsed.description);
      return { message: `Aporte de ${money(amountMinor, goal.currency)} a la meta "${goal.name}".`, warning: null, transactionId: null };
    }

    case 'investment_buy':
    case 'investment_sell': {
      const account = need(
        hinted.find((h) => h.account.type === 'brokerage')?.account ?? byId(s?.defaultInvestmentAccountId),
        'de inversión',
      );
      const symbol = parsed.symbol!;
      let quantity = parsed.quantity ? Number(parsed.quantity) : null;
      let price = parsed.price ? Number(parsed.price) : null;
      if (!quantity || !price) {
        const [sec] = await db.select().from(securities).where(eq(securities.symbol, symbol));
        if (!sec?.lastPrice || !parsed.amount)
          throw new AppError(`Dime cantidad y precio: "Compré 2 ${symbol} a 510 USD". Aún no tengo un precio de ${symbol}.`);
        price = sec.lastPrice;
        quantity = Math.round((Number(parsed.amount) / price) * 1e6) / 1e6;
      }
      const id = await createTrade(db, {
        accountId: account.id,
        symbol,
        side: parsed.intent === 'investment_buy' ? 'buy' : 'sell',
        quantity,
        price,
        date: parsed.date,
      });
      const verb = parsed.intent === 'investment_buy' ? 'Compra' : 'Venta';
      return {
        message: `${verb} de ${quantity} ${symbol} a ${price} ${account.currency} en ${account.name}${parsed.quantity ? '' : ' (cantidad calculada con el último precio; corrígela en Inversiones si no coincide)'}.`,
        warning: null,
        transactionId: id,
      };
    }
  }
}
