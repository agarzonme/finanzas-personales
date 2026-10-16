import Link from 'next/link';
import { db } from '@/server/db/client';
import { requireAuth } from '@/server/auth';
import { budgetStatus, cashflow, monthTotals, netWorth, netWorthHistory, spendingByCategory } from '@/server/services/reports';
import { listGoals } from '@/server/services/goals';
import { currentMonth, monthLabel, today } from '@/lib/dates';
import { fromMinor } from '@/lib/money';
import { QuickAdd } from '@/components/QuickAdd';
import { CashflowChart, NetWorthChart } from '@/components/charts';
import { Empty, Money, Pct, Progress, Section } from '@/components/ui';

export const metadata = { title: 'Resumen' };

export default async function ResumenPage() {
  await requireAuth();
  const t = today();
  const month = currentMonth();
  const [nw, totals, byCategory, budgets, goals, flow, history] = await Promise.all([
    netWorth(db, t, { snapshot: true }),
    monthTotals(db, month),
    spendingByCategory(db, month),
    budgetStatus(db, month),
    listGoals(db, t),
    cashflow(db, month, 12),
    netWorthHistory(db),
  ]);
  const alerts = budgets.filter((b) => b.status !== 'ok');
  const maxCat = Math.max(1, ...byCategory.map((c) => c.amountMinor));

  return (
    <>
      {/* Lo primero: cuánto vales hoy. */}
      <section aria-labelledby="nw" className="mb-8">
        <p id="nw" className="text-sm text-ink-soft">
          Patrimonio neto hoy
        </p>
        <p className="num font-serif text-5xl leading-tight md:text-6xl">
          <Money minor={nw.netWorthMinor} />
        </p>
        <dl className="mt-3 grid max-w-xl grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-ink-soft">Cuentas y efectivo</dt>
            <dd>
              <Money minor={nw.assetsMinor} />
            </dd>
          </div>
          <div>
            <dt className="text-ink-soft">Inversiones</dt>
            <dd>
              <Money minor={nw.investmentsMinor} />
            </dd>
          </div>
          <div>
            <dt className="text-ink-soft">Deudas</dt>
            <dd>
              <Money minor={nw.liabilitiesMinor ? -nw.liabilitiesMinor : 0} />
            </dd>
          </div>
        </dl>
        {nw.missingRates.length ? (
          <p className="mt-3 rounded-md bg-amber-tint px-3 py-2 text-sm text-amber">
            Falta la tasa de {nw.missingRates.join(' y ')} → COP, así que esas cuentas no suman.{' '}
            <Link href="/ajustes" className="underline">
              Regístrala en Ajustes
            </Link>
            .
          </p>
        ) : null}
      </section>

      <QuickAdd />

      {alerts.length ? (
        <section aria-label="Alertas de presupuesto" className="mb-8 space-y-2">
          {alerts.map((a) => (
            <p key={a.categoryId} className={`rounded-md px-3 py-2 text-sm ${a.status === 'exceeded' ? 'bg-red-tint text-red' : 'bg-amber-tint text-amber'}`}>
              {a.status === 'exceeded' ? (
                <>
                  Te pasaste del presupuesto de {a.name} por <Money minor={-a.remainingMinor} tone="neutral" /> (llevas <Pct value={a.pct} />).
                </>
              ) : (
                <>
                  Llevas <Pct value={a.pct} /> del presupuesto de {a.name}; te quedan <Money minor={a.remainingMinor} tone="neutral" />.
                </>
              )}
            </p>
          ))}
        </section>
      ) : null}

      <div className="grid gap-x-10 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <Section title={`Así va ${monthLabel(month, true)}`}>
            <dl className="mb-6 grid grid-cols-3 gap-4 border-y border-rule py-4">
              <div>
                <dt className="text-sm text-ink-soft">Entró</dt>
                <dd className="font-serif text-xl">
                  <Money minor={totals.income} tone="in" />
                </dd>
              </div>
              <div>
                <dt className="text-sm text-ink-soft">Salió</dt>
                <dd className="font-serif text-xl">
                  <Money minor={totals.expenses} tone="out" />
                </dd>
              </div>
              <div>
                <dt className="text-sm text-ink-soft">Ahorraste</dt>
                <dd className="font-serif text-xl">
                  <Pct value={totals.savingsRate} />
                </dd>
              </div>
            </dl>
            <CashflowChart data={flow.map((p) => ({ month: p.month, income: fromMinor(p.incomeMinor), expenses: fromMinor(p.expensesMinor) }))} />
          </Section>

          <Section title="En qué se fue la plata" aside={<Link href="/movimientos" className="text-ledger hover:underline">Ver movimientos</Link>}>
            {byCategory.length ? (
              <ul className="ledger-rows">
                {byCategory.map((c) => (
                  <li key={c.categoryId ?? 'none'} className="py-2">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span>
                        <span aria-hidden className="mr-2">
                          {c.icon ?? '·'}
                        </span>
                        {c.name}
                      </span>
                      <Money minor={c.amountMinor} />
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-rule">
                      <div className="h-full rounded-full bg-red/70" style={{ width: `${(c.amountMinor / maxCat) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Aún no hay gastos este mes. Anota el primero arriba.</Empty>
            )}
          </Section>
        </div>

        <div>
          <Section title="Presupuestos" aside={<Link href="/presupuestos" className="text-ledger hover:underline">Ajustar</Link>}>
            {budgets.length ? (
              <ul className="space-y-4">
                {budgets.slice(0, 6).map((b) => (
                  <li key={b.categoryId}>
                    <div className="mb-1 flex justify-between gap-3 text-sm">
                      <span>{b.name}</span>
                      <span className="text-ink-soft">
                        <Money minor={b.spentMinor} tone="neutral" /> de <Money minor={b.budgetMinor} tone="neutral" />
                      </span>
                    </div>
                    <Progress value={b.pct} status={b.status} label={`Presupuesto de ${b.name}`} />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>
                Define cuánto quieres gastar por categoría en <Link href="/presupuestos" className="text-ledger underline">Presupuestos</Link>.
              </Empty>
            )}
          </Section>

          <Section title="Metas" aside={<Link href="/metas" className="text-ledger hover:underline">Ver todas</Link>}>
            {goals.length ? (
              <ul className="space-y-4">
                {goals.slice(0, 4).map((g) => (
                  <li key={g.id}>
                    <div className="mb-1 flex justify-between gap-3 text-sm">
                      <span>{g.name}</span>
                      <Pct value={g.pct} />
                    </div>
                    <Progress value={g.pct} label={`Avance de ${g.name}`} />
                    <p className="mt-1 text-xs text-ink-soft">
                      <Money minor={g.currentMinor} tone="neutral" currency={g.currency} /> de{' '}
                      <Money minor={g.targetMinor} tone="neutral" currency={g.currency} />
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>
                Crea tu primera meta (fondo de emergencia, viaje, vivienda) en <Link href="/metas" className="text-ledger underline">Metas</Link>.
              </Empty>
            )}
          </Section>

          <Section title="Patrimonio en el tiempo">
            <NetWorthChart data={history.map((h) => ({ date: h.date, netWorth: fromMinor(h.netWorthMinor) }))} />
          </Section>
        </div>
      </div>
    </>
  );
}
