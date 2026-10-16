/**
 * Prueba de punta a punta de la lógica contable con una base SQLite real (archivo temporal).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '@/server/db/connect';
import { accounts, categories, transactions } from '@/server/db/schema';
import { seedIfEmpty } from '@/server/db/seed';
import { getAccountBalance, listAccountsWithBalances } from '@/server/services/accounts';
import { exportBackup, importBackup } from '@/server/services/backup';
import { createGoal, listGoals } from '@/server/services/goals';
import { setRate } from '@/server/services/fx';
import { computePositions, createTrade } from '@/server/services/investments';
import { createTransaction, deleteTransactions, reconcileAccount, updateTransaction } from '@/server/services/ledger';
import { quickAdd } from '@/server/services/quickAdd';
import { budgetStatus, cashflow, monthTotals, netWorth, setBudget } from '@/server/services/reports';
import { createDebt, listDebts } from '@/server/services/debts';

const TODAY = '2026-10-14';
let dir: string;
let db: Db;
const acc: Record<string, string> = {};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'finanzas-test-'));
  db = createDb(`file:${join(dir, 'test.db')}`);
  await migrate(db, { migrationsFolder: './drizzle' });
  await seedIfEmpty(db);
  for (const a of await db.select().from(accounts)) acc[a.name] = a.id;
  await setRate(db, 'USD', '2026-10-01', 4000);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const balance = (name: string) => getAccountBalance(db, acc[name]!);

describe('libro mayor', () => {
  it('un gasto rápido baja el saldo y se categoriza solo', async () => {
    const r = await quickAdd(db, 'Gasté 25.000 en almuerzo', TODAY);
    expect(r.message).toContain('Restaurantes y domicilios');
    expect(await balance('Bancolombia')).toBe(-2_500_000);
  });

  it('la tarjeta acumula deuda y el pago la reduce sin contar como gasto', async () => {
    await quickAdd(db, 'Gasté 100.000 en ropa con la tarjeta', TODAY);
    expect(await balance('Tarjeta de crédito')).toBe(-10_000_000);
    await quickAdd(db, 'Pagué 60.000 de la tarjeta', TODAY);
    expect(await balance('Tarjeta de crédito')).toBe(-4_000_000);
    expect(await balance('Bancolombia')).toBe(-8_500_000);
    const totals = await monthTotals(db, '2026-10');
    expect(totals.expenses).toBe(12_500_000); // 25.000 + 100.000; el pago de la tarjeta no es gasto
  });

  it('ingreso de salario', async () => {
    await quickAdd(db, 'Recibí salario por 4.000.000', TODAY);
    expect(await balance('Bancolombia')).toBe(391_500_000);
    const totals = await monthTotals(db, '2026-10');
    expect(totals.income).toBe(400_000_000);
  });

  it('transferencia COP → USD usa la TRM', async () => {
    await quickAdd(db, 'Pasé 2.000.000 de Bancolombia a Hapi', TODAY);
    expect(await balance('Hapi')).toBe(50_000); // US$ 500,00
  });

  it('compra de inversión: baja el efectivo del broker y crea la posición', async () => {
    await createTrade(db, { accountId: acc.Hapi!, symbol: 'VOO', side: 'buy', quantity: 2, price: 200, date: TODAY });
    expect(await balance('Hapi')).toBe(10_000); // quedan US$ 100
    const [pos] = await computePositions(db);
    expect(pos).toMatchObject({ symbol: 'VOO', quantity: 2, valueMinor: 40_000, valueBaseMinor: 160_000_000 });
    // Con el último precio conocido, el registro rápido calcula la cantidad.
    await quickAdd(db, 'Invertí 100 USD en VOO', TODAY);
    expect((await computePositions(db))[0]!.quantity).toBe(2.5);
    await expect(createTrade(db, { accountId: acc.Hapi!, symbol: 'VOO', side: 'sell', quantity: 10, price: 210, date: TODAY })).rejects.toThrow(
      /Solo tienes/,
    );
  });

  it('patrimonio = activos + inversiones − deudas', async () => {
    const nw = await netWorth(db, TODAY, { snapshot: true });
    expect(nw.investmentsMinor).toBe(200_000_000); // 2,5 VOO × 200 × 4.000
    expect(nw.liabilitiesMinor).toBe(4_000_000);
    expect(nw.netWorthMinor).toBe(nw.assetsMinor + nw.investmentsMinor - nw.liabilitiesMinor);
    expect(nw.missingRates).toEqual([]);
  });

  it('presupuesto avisa al pasar el 80 %', async () => {
    const [rest] = await db.select().from(categories).where(eq(categories.name, 'Restaurantes y domicilios'));
    await setBudget(db, rest!.id, 3_000_000, '2026-10');
    const r = await quickAdd(db, 'Gasté 3.000 en café', TODAY);
    expect(r.warning).toMatch(/presupuesto de Restaurantes/);
    const [b] = await budgetStatus(db, '2026-10');
    expect(b).toMatchObject({ spentMinor: 2_800_000, status: 'warning' });
  });

  it('corregir una categoría aprende la regla', async () => {
    const id = await createTransaction(db, { type: 'expense', date: TODAY, accountId: acc.Nu!, amountMinor: 5_000_000, description: 'Pedido Frisby' });
    const [salud] = await db.select().from(categories).where(eq(categories.name, 'Restaurantes y domicilios'));
    await updateTransaction(db, id, { categoryId: salud!.id });
    const id2 = await createTransaction(db, { type: 'expense', date: TODAY, accountId: acc.Nu!, amountMinor: 4_000_000, description: 'Pedido Frisby' });
    const [t2] = await db.select().from(transactions).where(eq(transactions.id, id2));
    expect(t2!.categoryId).toBe(salud!.id);
    await deleteTransactions(db, [id, id2]);
    expect(await balance('Nu')).toBe(0);
  });

  it('metas: aporte por texto y proyección', async () => {
    await createGoal(db, {
      name: 'Viaje a Japón',
      kind: 'travel',
      targetMinor: 1_200_000_000,
      currency: 'COP',
      targetDate: '2027-12-01',
      accountId: null,
      initialMinor: 0,
      monthlyPlanMinor: 100_000_000,
      expectedReturnEa: 0,
      priority: 1,
    });
    const r = await quickAdd(db, 'Ahorré 300.000 para el viaje', TODAY);
    expect(r.message).toContain('Viaje a Japón');
    const [g] = await listGoals(db, TODAY);
    expect(g).toMatchObject({ currentMinor: 30_000_000, monthsLeft: 12 });
  });

  it('deudas ligadas a la tarjeta usan su saldo', async () => {
    await createDebt(db, {
      name: 'Tarjeta',
      kind: 'credit_card',
      accountId: acc['Tarjeta de crédito']!,
      balanceMinor: null,
      originalMinor: 10_000_000,
      rateEa: 0.28,
      paymentMinor: 2_000_000,
      paymentDay: 5,
      currency: 'COP',
    });
    const [d] = await listDebts(db, TODAY);
    expect(d).toMatchObject({ balanceMinor: 4_000_000, monthsLeft: 3 });
  });

  it('ajustar el saldo al valor real del banco', async () => {
    const current = await balance('Efectivo');
    await reconcileAccount(db, acc.Efectivo!, 15_000_000, TODAY, current);
    expect(await balance('Efectivo')).toBe(15_000_000);
  });

  it('flujo de caja de 12 meses', async () => {
    const points = await cashflow(db, '2026-10', 12);
    expect(points).toHaveLength(12);
    expect(points.at(-1)).toMatchObject({ month: '2026-10', incomeMinor: 400_000_000 });
  });

  it('respaldo: exportar e importar deja todo igual', async () => {
    const before = await listAccountsWithBalances(db);
    const backup = JSON.parse(JSON.stringify(await exportBackup(db)));
    await importBackup(db, backup);
    const after = await listAccountsWithBalances(db);
    expect(after.map((a) => a.balanceMinor)).toEqual(before.map((a) => a.balanceMinor));
  });
});
