/**
 * Modelo de datos (SQLite / Turso).
 *
 * - Dinero en ENTEROS de centavos (columnas *_minor). $ 25.000 COP = 2500000.
 * - Libro mayor simplificado: cada movimiento genera 1 o 2 `entries` con signo.
 *   Saldo de una cuenta = saldo inicial + suma de sus entries. Así pagar la tarjeta
 *   o pasar plata a Hapi mueve saldos sin contarse como gasto.
 * - Fechas como texto AAAA-MM-DD (hora de Colombia). IDs como UUID en texto.
 */
import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import {
  ACCOUNT_TYPES,
  ASSET_CLASSES,
  CATEGORY_KINDS,
  DEBT_KINDS,
  GOAL_KINDS,
  GOAL_STATUSES,
  TRANSACTION_TYPES,
} from '@/lib/constants';

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

// Configuración general: una sola fila (id = 1).
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  ownerName: text('owner_name').notNull().default(''),
  baseCurrency: text('base_currency').notNull().default('COP'),
  defaultExpenseAccountId: text('default_expense_account_id'),
  defaultIncomeAccountId: text('default_income_account_id'),
  defaultCardAccountId: text('default_card_account_id'),
  defaultInvestmentAccountId: text('default_investment_account_id'),
  cashAccountId: text('cash_account_id'),
});

export const accounts = sqliteTable(
  'accounts',
  {
    id: id(),
    name: text('name').notNull(),
    type: text('type', { enum: ACCOUNT_TYPES }).notNull(),
    institution: text('institution'),
    currency: text('currency').notNull().default('COP'),
    openingBalanceMinor: integer('opening_balance_minor').notNull().default(0),
    creditLimitMinor: integer('credit_limit_minor'),
    // Palabras con las que la nombras en el registro rápido: ["nu", "tarjeta nu"].
    aliases: text('aliases', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    includeInNetWorth: integer('include_in_net_worth', { mode: 'boolean' }).notNull().default(true),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('accounts_name_uq').on(t.name)],
);

export const categories = sqliteTable(
  'categories',
  {
    id: id(),
    name: text('name').notNull(),
    kind: text('kind', { enum: CATEGORY_KINDS }).notNull(),
    icon: text('icon'),
    isEssential: integer('is_essential', { mode: 'boolean' }).notNull().default(false),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [uniqueIndex('categories_kind_name_uq').on(t.kind, t.name)],
);

// "Si la descripción contiene X → categoría Y". Se aprenden cuando corriges una categoría.
export const categoryRules = sqliteTable(
  'category_rules',
  {
    id: id(),
    pattern: text('pattern').notNull(), // minúsculas, sin tildes
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    source: text('source', { enum: ['seed', 'learned', 'user'] }).notNull().default('user'),
    hits: integer('hits').notNull().default(0),
  },
  (t) => [uniqueIndex('rules_pattern_uq').on(t.pattern)],
);

export const goals = sqliteTable('goals', {
  id: id(),
  name: text('name').notNull(),
  kind: text('kind', { enum: GOAL_KINDS }).notNull(),
  targetMinor: integer('target_minor').notNull(),
  currency: text('currency').notNull().default('COP'),
  targetDate: text('target_date'),
  // Si la meta vive en una cuenta (p. ej. un bolsillo), el avance es el saldo de esa cuenta.
  accountId: text('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  initialMinor: integer('initial_minor').notNull().default(0),
  monthlyPlanMinor: integer('monthly_plan_minor'),
  expectedReturnEa: real('expected_return_ea').notNull().default(0),
  priority: integer('priority').notNull().default(3),
  status: text('status', { enum: GOAL_STATUSES }).notNull().default('active'),
  createdAt: createdAt(),
});

export const debts = sqliteTable('debts', {
  id: id(),
  name: text('name').notNull(),
  kind: text('kind', { enum: DEBT_KINDS }).notNull(),
  // Si está ligada a una cuenta (tarjeta, crédito) el saldo sale de los movimientos.
  accountId: text('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  balanceMinor: integer('balance_minor'), // saldo manual cuando no hay cuenta
  originalMinor: integer('original_minor').notNull(),
  rateEa: real('rate_ea').notNull(), // 0.2899 = 28,99 % EA
  paymentMinor: integer('payment_minor'), // cuota que pagas al mes
  paymentDay: integer('payment_day'),
  currency: text('currency').notNull().default('COP'),
  status: text('status', { enum: ['active', 'paid_off'] }).notNull().default('active'),
  createdAt: createdAt(),
});

export const transactions = sqliteTable(
  'transactions',
  {
    id: id(),
    type: text('type', { enum: TRANSACTION_TYPES }).notNull(),
    date: text('date').notNull(), // AAAA-MM-DD
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    toAccountId: text('to_account_id').references(() => accounts.id, { onDelete: 'restrict' }),
    amountMinor: integer('amount_minor').notNull(), // siempre positivo
    currency: text('currency').notNull(),
    toAmountMinor: integer('to_amount_minor'), // transferencias entre monedas
    amountBaseMinor: integer('amount_base_minor').notNull(), // en COP, con la TRM de la fecha
    fxRate: real('fx_rate').notNull().default(1),
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
    description: text('description').notNull(),
    notes: text('notes'),
    goalId: text('goal_id').references(() => goals.id, { onDelete: 'set null' }),
    debtId: text('debt_id').references(() => debts.id, { onDelete: 'set null' }),
    source: text('source', { enum: ['manual', 'quick', 'import', 'system'] })
      .notNull()
      .default('manual'),
    createdAt: createdAt(),
  },
  (t) => [
    index('tx_date_idx').on(t.date),
    index('tx_account_idx').on(t.accountId),
    index('tx_category_idx').on(t.categoryId),
    check('tx_amount_positive', sql`${t.amountMinor} > 0`),
    check('tx_transfer_destination', sql`(${t.type} = 'transfer') = (${t.toAccountId} IS NOT NULL)`),
  ],
);

export const entries = sqliteTable(
  'entries',
  {
    id: id(),
    transactionId: text('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    amountMinor: integer('amount_minor').notNull(), // con signo, en la moneda de la cuenta
  },
  (t) => [index('entries_account_idx').on(t.accountId), index('entries_tx_idx').on(t.transactionId)],
);

// Aportes a metas que no tienen cuenta propia ("bolsillos virtuales").
export const goalContributions = sqliteTable(
  'goal_contributions',
  {
    id: id(),
    goalId: text('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    amountMinor: integer('amount_minor').notNull(), // negativo = retiro
    date: text('date').notNull(),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('goal_contrib_goal_idx').on(t.goalId, t.date)],
);

// Un presupuesto rige desde `effective_from` (AAAA-MM) hasta que otro lo reemplace.
export const budgets = sqliteTable(
  'budgets',
  {
    id: id(),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    amountMinor: integer('amount_minor').notNull(),
    effectiveFrom: text('effective_from').notNull(),
  },
  (t) => [uniqueIndex('budgets_category_from_uq').on(t.categoryId, t.effectiveFrom)],
);

export const securities = sqliteTable('securities', {
  id: id(),
  symbol: text('symbol').notNull().unique(),
  name: text('name'),
  assetClass: text('asset_class', { enum: ASSET_CLASSES }).notNull().default('etf'),
  currency: text('currency').notNull().default('USD'),
  lastPrice: real('last_price'),
  lastPriceDate: text('last_price_date'),
});

export const prices = sqliteTable(
  'prices',
  {
    securityId: text('security_id')
      .notNull()
      .references(() => securities.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    price: real('price').notNull(),
  },
  (t) => [primaryKey({ columns: [t.securityId, t.date] })],
);

// Compras y ventas. La parte de efectivo queda como un movimiento tipo 'trade' en la cuenta del broker.
export const trades = sqliteTable(
  'trades',
  {
    id: id(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    securityId: text('security_id')
      .notNull()
      .references(() => securities.id, { onDelete: 'restrict' }),
    side: text('side', { enum: ['buy', 'sell'] }).notNull(),
    quantity: real('quantity').notNull(),
    price: real('price').notNull(),
    feesMinor: integer('fees_minor').notNull().default(0),
    date: text('date').notNull(),
    transactionId: text('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('trades_account_idx').on(t.accountId, t.date), check('trades_quantity_positive', sql`${t.quantity} > 0`)],
);

// TRM y otras tasas: cuántos COP vale 1 unidad de `currency` en `date`.
export const fxRates = sqliteTable(
  'fx_rates',
  {
    currency: text('currency').notNull(),
    date: text('date').notNull(),
    rate: real('rate').notNull(),
  },
  (t) => [primaryKey({ columns: [t.currency, t.date] })],
);

// Foto diaria del patrimonio (se guarda al abrir el resumen) para la gráfica histórica.
export const netWorthSnapshots = sqliteTable('net_worth_snapshots', {
  date: text('date').primaryKey(),
  assetsMinor: integer('assets_minor').notNull(),
  liabilitiesMinor: integer('liabilities_minor').notNull(),
  investmentsMinor: integer('investments_minor').notNull(),
  netWorthMinor: integer('net_worth_minor').notNull(),
});
