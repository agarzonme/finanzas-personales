import { db } from '@/server/db/client';
import { requireAuth } from '@/server/auth';
import { listAccountsWithBalances } from '@/server/services/accounts';
import { listCategories, listTransactions } from '@/server/services/reports';
import { currentMonth, dateLabel, isMonthKey, monthLabel, shiftMonth } from '@/lib/dates';
import { QuickAdd } from '@/components/QuickAdd';
import { Disclosure, Empty, Money, PageHeader } from '@/components/ui';
import { TransactionForm } from './TransactionForm';
import { TransactionRow } from './TransactionRow';

export const metadata = { title: 'Movimientos' };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function MovimientosPage({ searchParams }: { searchParams: Search }) {
  await requireAuth();
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === 'string' && sp[k] ? (sp[k] as string) : undefined);
  const month = pick('month') === 'all' ? undefined : isMonthKey(pick('month') ?? '') ? pick('month') : currentMonth();
  const filters = { month, accountId: pick('account'), categoryId: pick('category'), type: pick('type'), q: pick('q') };

  const [rows, accounts, categories] = await Promise.all([
    listTransactions(db, filters),
    listAccountsWithBalances(db),
    listCategories(db),
  ]);
  const months = Array.from({ length: 24 }, (_, i) => shiftMonth(currentMonth(), -i));

  // Agrupar por día, como en un libro.
  const byDay = new Map<string, typeof rows>();
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);
  const totalIn = rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amountBaseMinor, 0);
  const totalOut = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amountBaseMinor, 0);

  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency, type: a.type }));
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, icon: c.icon }));

  return (
    <>
      <PageHeader title="Movimientos" lead="Todo lo que entra, sale o se mueve entre tus cuentas." />
      <QuickAdd autoFocus />

      <div className="mb-8">
        <Disclosure summary="Registrar con formulario (más control)">
          <TransactionForm accounts={accountOptions} categories={categoryOptions} />
        </Disclosure>
      </div>

      <form method="get" className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-[repeat(4,minmax(0,1fr))_2fr_auto]">
        <select name="month" defaultValue={month ?? 'all'} className="field" aria-label="Mes">
          <option value="all">Todos los meses</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m, true)}
            </option>
          ))}
        </select>
        <select name="account" defaultValue={filters.accountId ?? ''} className="field" aria-label="Cuenta">
          <option value="">Todas las cuentas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={filters.categoryId ?? ''} className="field" aria-label="Categoría">
          <option value="">Todas las categorías</option>
          <option value="none">Sin categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={filters.type ?? ''} className="field" aria-label="Tipo">
          <option value="">Todos los tipos</option>
          <option value="expense">Gastos</option>
          <option value="income">Ingresos</option>
          <option value="transfer">Transferencias</option>
          <option value="trade">Inversiones</option>
          <option value="adjustment">Ajustes</option>
        </select>
        <input name="q" defaultValue={filters.q ?? ''} placeholder="Buscar descripción" className="field col-span-2 md:col-span-1" />
        <button className="min-h-10 rounded-md border border-rule-strong px-4 text-sm hover:bg-ledger-tint">Filtrar</button>
      </form>

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3 text-sm text-ink-soft">
        <p>
          {rows.length} movimientos. Entró <Money minor={totalIn} tone="in" /> y salió <Money minor={totalOut} tone="out" />.
        </p>
        <a href={`/api/export/csv${month ? `?month=${month}` : ''}`} className="text-ledger hover:underline">
          Descargar CSV para Excel
        </a>
      </div>

      {rows.length === 0 ? (
        <Empty>No hay movimientos con estos filtros.</Empty>
      ) : (
        <div className="space-y-6">
          {[...byDay.entries()].map(([day, items]) => (
            <section key={day} aria-label={dateLabel(day)}>
              <h2 className="mb-1 border-b border-rule-strong pb-1 text-sm font-medium text-ink-soft">{dateLabel(day)}</h2>
              <ul className="ledger-rows">
                {items.map((r) => (
                  <TransactionRow key={r.id} row={r} categories={categoryOptions} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
