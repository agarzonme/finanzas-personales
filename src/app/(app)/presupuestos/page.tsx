import { db } from '@/server/db/client';
import { requireAuth } from '@/server/auth';
import { budgetStatus, listCategories, spendingByCategory } from '@/server/services/reports';
import { setBudgetAction } from '@/server/actions/planning';
import { currentMonth, isMonthKey, monthLabel, shiftMonth } from '@/lib/dates';
import { toInputValue } from '@/lib/money';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { Money, PageHeader, Pct, Progress, Section } from '@/components/ui';

export const metadata = { title: 'Presupuestos' };

export default async function PresupuestosPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireAuth();
  const sp = await searchParams;
  const month = sp.month && isMonthKey(sp.month) ? sp.month : currentMonth();
  const [status, spending, categories] = await Promise.all([budgetStatus(db, month), spendingByCategory(db, month), listCategories(db)]);
  const byCat = new Map(status.map((s) => [s.categoryId, s]));
  const spent = new Map(spending.map((s) => [s.categoryId, s.amountMinor]));
  const expenseCats = categories.filter((c) => c.kind === 'expense');
  const totalBudget = status.reduce((s, b) => s + b.budgetMinor, 0);
  const totalSpentBudgeted = status.reduce((s, b) => s + b.spentMinor, 0);
  const unbudgeted = spending.filter((s) => !s.categoryId || !byCat.has(s.categoryId)).reduce((s, c) => s + c.amountMinor, 0);

  return (
    <>
      <PageHeader title="Presupuestos" lead="Cuánto quieres gastar al mes por categoría. Un presupuesto rige desde el mes que lo guardas hasta que lo cambies.">
        <nav aria-label="Cambiar de mes" className="flex items-center gap-2 text-sm">
          <a href={`?month=${shiftMonth(month, -1)}`} className="rounded-md border border-rule-strong px-3 py-1.5 hover:bg-ledger-tint" aria-label="Mes anterior">
            ‹
          </a>
          <span className="min-w-32 text-center font-medium">{monthLabel(month, true)}</span>
          <a href={`?month=${shiftMonth(month, 1)}`} className="rounded-md border border-rule-strong px-3 py-1.5 hover:bg-ledger-tint" aria-label="Mes siguiente">
            ›
          </a>
        </nav>
      </PageHeader>

      <dl className="mb-8 grid max-w-2xl grid-cols-3 gap-4">
        <div>
          <dt className="text-sm text-ink-soft">Presupuestado</dt>
          <dd className="font-serif text-2xl">
            <Money minor={totalBudget} />
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink-soft">Gastado en esas categorías</dt>
          <dd className="font-serif text-2xl">
            <Money minor={totalSpentBudgeted} tone={totalSpentBudgeted > totalBudget ? 'out' : 'neutral'} />
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink-soft">Gasto sin presupuesto</dt>
          <dd className="font-serif text-2xl">
            <Money minor={unbudgeted} />
          </dd>
        </div>
      </dl>

      <Section title="Por categoría" aside="Escribe 0 para quitar un presupuesto.">
        <ul className="ledger-rows">
          {expenseCats.map((c) => {
            const b = byCat.get(c.id);
            const s = b?.spentMinor ?? spent.get(c.id) ?? 0;
            return (
              <li key={c.id} className="grid gap-3 py-3 md:grid-cols-[1fr_16rem] md:items-center">
                <div>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      <span aria-hidden className="mr-2">
                        {c.icon}
                      </span>
                      {c.name}
                      {c.isEssential ? <span className="ml-2 text-xs text-ink-soft">esencial</span> : null}
                    </span>
                    <span className="text-sm text-ink-soft">
                      <Money minor={s} tone="neutral" />
                      {b ? (
                        <>
                          {' '}
                          de <Money minor={b.budgetMinor} tone="neutral" /> (<Pct value={b.pct} />)
                        </>
                      ) : null}
                    </span>
                  </div>
                  {b ? <Progress value={b.pct} status={b.status} label={`Presupuesto de ${c.name}`} /> : null}
                </div>
                <ActionForm action={setBudgetAction} resetOnSuccess={false} hideSuccess className="flex gap-2">
                  <input type="hidden" name="categoryId" value={c.id} />
                  <input type="hidden" name="month" value={month} />
                  <input
                    name="amount"
                    inputMode="decimal"
                    aria-label={`Presupuesto mensual de ${c.name}`}
                    defaultValue={b ? toInputValue(b.budgetMinor) : ''}
                    placeholder="Sin presupuesto"
                    className="field num"
                  />
                  <SubmitButton variant="quiet">Guardar</SubmitButton>
                </ActionForm>
              </li>
            );
          })}
        </ul>
      </Section>
    </>
  );
}
