import { db } from '@/server/db/client';
import { requireAuth } from '@/server/auth';
import { listGoals } from '@/server/services/goals';
import { listAccountsWithBalances } from '@/server/services/accounts';
import { contributeGoalAction, createGoalAction, deleteGoalAction, goalStatusAction } from '@/server/actions/planning';
import { GOAL_KIND_LABEL, GOAL_KINDS } from '@/lib/constants';
import { dateLabel, today } from '@/lib/dates';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { Disclosure, Empty, Field, Money, PageHeader, Pct, Progress, Section } from '@/components/ui';

export const metadata = { title: 'Metas' };

export default async function MetasPage() {
  await requireAuth();
  const t = today();
  const [goals, accounts] = await Promise.all([listGoals(db, t), listAccountsWithBalances(db)]);
  const savingsAccounts = accounts.filter((a) => !a.isLiability && a.type !== 'credit_card');

  return (
    <>
      <PageHeader
        title="Metas"
        lead="Fondo de emergencia, viajes, vivienda, retiro. La app calcula cuándo llegas a tu ritmo y cuánto necesitas ahorrar al mes para llegar a tiempo."
      />

      {goals.length === 0 ? <Empty>Aún no tienes metas. Crea la primera abajo; un buen comienzo es un fondo de emergencia de 3 a 6 meses de gastos.</Empty> : null}

      <ul className="mb-10 space-y-6">
        {goals.map((g) => (
          <li key={g.id} className="rounded-lg border border-rule bg-sheet p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2 className="font-serif text-xl">{g.name}</h2>
                <p className="text-sm text-ink-soft">
                  {[GOAL_KIND_LABEL[g.kind] !== g.name ? GOAL_KIND_LABEL[g.kind] : null, g.targetDate ? `para el ${dateLabel(g.targetDate)}` : null]
                    .filter(Boolean)
                    .join(', ')
                    .replace(/^./, (c) => c.toUpperCase())}
                  {g.status === 'paused' ? ', en pausa' : ''}
                </p>
              </div>
              <p className="text-right">
                <span className="font-serif text-2xl">
                  <Money minor={g.currentMinor} currency={g.currency} />
                </span>
                <span className="block text-sm text-ink-soft">
                  de <Money minor={g.targetMinor} currency={g.currency} tone="neutral" /> (<Pct value={g.pct} />)
                </span>
              </p>
            </div>
            <Progress value={g.pct} label={`Avance de ${g.name}`} />

            <div className="mt-4 space-y-1 text-sm">
              {g.status === 'achieved' ? (
                <p className="text-ledger">Meta cumplida.</p>
              ) : (
                <>
                  {g.monthlyMinor ? (
                    <p>
                      {g.monthlyIsPlan ? 'Aportando' : 'Al ritmo de tus últimos 3 meses,'} <Money minor={g.monthlyMinor} tone="neutral" /> al mes
                      {g.expectedReturnEa ? ` con ${(g.expectedReturnEa * 100).toFixed(1).replace('.', ',')} % EA` : ''}
                      {g.projectedDate ? (
                        <>
                          {' '}
                          llegas en <strong>{dateLabel(g.projectedDate)}</strong> ({g.monthsLeft} meses).
                        </>
                      ) : (
                        '.'
                      )}
                    </p>
                  ) : (
                    <p className="text-ink-soft">Define un aporte mensual o registra aportes para estimar cuándo llegas.</p>
                  )}
                  {g.targetDate && g.monthlyNeededMinor != null ? (
                    <p className={g.onTrack ? 'text-ledger' : 'text-amber'}>
                      Para llegar a tiempo necesitas <Money minor={g.monthlyNeededMinor} tone="neutral" /> al mes
                      {g.onTrack ? ': vas bien.' : ': vas atrasado.'}
                    </p>
                  ) : null}
                </>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-start gap-4">
              {g.accountId ? (
                <p className="text-sm text-ink-soft">El avance es el saldo de su cuenta. Para aportar, transfiere a esa cuenta (o escribe «Ahorré 200.000 para {g.name.toLowerCase()}»).</p>
              ) : (
                <ActionForm action={contributeGoalAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="goalId" value={g.id} />
                  <Field label="Monto">
                    <input name="amount" required inputMode="decimal" placeholder="200.000" className="field num w-36" />
                  </Field>
                  <Field label="Fecha">
                    <input name="date" type="date" defaultValue={t} className="field" />
                  </Field>
                  <select name="direction" className="field w-auto" aria-label="Aporte o retiro">
                    <option value="in">Aporte</option>
                    <option value="out">Retiro</option>
                  </select>
                  <SubmitButton variant="quiet">Registrar</SubmitButton>
                </ActionForm>
              )}
              <div className="ml-auto flex gap-2">
                <ActionForm action={goalStatusAction}>
                  <input type="hidden" name="id" value={g.id} />
                  <input type="hidden" name="status" value={g.status === 'paused' ? 'active' : 'paused'} />
                  <SubmitButton variant="quiet">{g.status === 'paused' ? 'Reactivar' : 'Pausar'}</SubmitButton>
                </ActionForm>
                <ActionForm action={deleteGoalAction} confirm={`¿Borrar la meta "${g.name}" y sus aportes?`}>
                  <input type="hidden" name="id" value={g.id} />
                  <SubmitButton variant="danger">Borrar</SubmitButton>
                </ActionForm>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Section title="Nueva meta">
        <Disclosure summary="Crear una meta" open={goals.length === 0}>
          <ActionForm action={createGoalAction} className="grid gap-3 md:grid-cols-3">
            <Field label="Nombre">
              <input name="name" required maxLength={60} placeholder="Viaje a Japón" className="field" />
            </Field>
            <Field label="Tipo">
              <select name="kind" className="field" defaultValue="emergency_fund">
                {GOAL_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {GOAL_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="¿Cuánto necesitas?">
              <input name="target" required inputMode="decimal" placeholder="12.000.000" className="field num" />
            </Field>
            <Field label="¿Para cuándo? (opcional)">
              <input name="targetDate" type="date" className="field" />
            </Field>
            <Field label="Aporte mensual planeado (opcional)">
              <input name="monthly" inputMode="decimal" placeholder="500.000" className="field num" />
            </Field>
            <Field label="Lo que ya tienes ahorrado">
              <input name="initial" inputMode="decimal" placeholder="0" className="field num" />
            </Field>
            <Field label="Cuenta donde vive (opcional)" hint="Si eliges una, el avance es el saldo de esa cuenta.">
              <select name="accountId" className="field" defaultValue="">
                <option value="">Ninguna: registro los aportes aquí</option>
                {savingsAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Rentabilidad esperada (% EA)" hint="Ej. 9 para un CDT o la Cajita al 9 % EA.">
              <input name="returnEa" inputMode="decimal" placeholder="0" className="field num" />
            </Field>
            <Field label="Prioridad (1 = más alta)">
              <input name="priority" type="number" min={1} max={5} defaultValue={3} className="field" />
            </Field>
            <div className="md:col-span-3">
              <SubmitButton>Crear meta</SubmitButton>
            </div>
          </ActionForm>
        </Disclosure>
      </Section>
    </>
  );
}
