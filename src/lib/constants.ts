// Valores cerrados de la app, con su etiqueta en español para mostrar en pantalla.

export const ACCOUNT_TYPES = ['checking', 'savings', 'credit_card', 'cash', 'brokerage', 'loan', 'other_asset', 'other_liability'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  checking: 'Cuenta de ahorros / débito',
  savings: 'Ahorro o bolsillo',
  credit_card: 'Tarjeta de crédito',
  cash: 'Efectivo',
  brokerage: 'Inversiones (broker)',
  loan: 'Crédito / préstamo',
  other_asset: 'Otro activo',
  other_liability: 'Otra deuda',
};
/** En estas cuentas el saldo es lo que debes: se guarda negativo. */
export const LIABILITY_TYPES: readonly AccountType[] = ['credit_card', 'loan', 'other_liability'];
export const isLiability = (t: AccountType) => LIABILITY_TYPES.includes(t);

export const TRANSACTION_TYPES = ['expense', 'income', 'transfer', 'trade', 'adjustment'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export const TRANSACTION_TYPE_LABEL: Record<TransactionType, string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  transfer: 'Transferencia',
  trade: 'Compra/venta de inversión',
  adjustment: 'Ajuste de saldo',
};

export const CATEGORY_KINDS = ['expense', 'income'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const GOAL_KINDS = ['emergency_fund', 'travel', 'housing', 'retirement', 'education', 'vehicle', 'other'] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];
export const GOAL_KIND_LABEL: Record<GoalKind, string> = {
  emergency_fund: 'Fondo de emergencia',
  travel: 'Viaje',
  housing: 'Vivienda',
  retirement: 'Retiro',
  education: 'Educación',
  vehicle: 'Vehículo',
  other: 'Otra',
};
export const GOAL_STATUSES = ['active', 'achieved', 'paused'] as const;

export const DEBT_KINDS = ['credit_card', 'consumer_loan', 'vehicle', 'mortgage', 'student', 'personal', 'other'] as const;
export type DebtKind = (typeof DEBT_KINDS)[number];
export const DEBT_KIND_LABEL: Record<DebtKind, string> = {
  credit_card: 'Tarjeta de crédito',
  consumer_loan: 'Crédito de consumo',
  vehicle: 'Crédito de vehículo',
  mortgage: 'Hipotecario',
  student: 'Educativo (ICETEX, etc.)',
  personal: 'Préstamo personal',
  other: 'Otra',
};

export const ASSET_CLASSES = ['etf', 'stock', 'bond', 'fund', 'crypto', 'other'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];
export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  etf: 'ETF',
  stock: 'Acción',
  bond: 'Bono',
  fund: 'Fondo',
  crypto: 'Cripto',
  other: 'Otro',
};

export const CURRENCIES = ['COP', 'USD', 'EUR'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const BASE_CURRENCY: Currency = 'COP';
