import { db } from '@/server/db/client';
import { requireAuth } from '@/server/auth';
import { listDebts } from '@/server/services/debts';
import { listAccountsWithBalances } from '@/server/services/accounts';
import { createDebtAction, deleteDebtAction, updateDebtAction } from '@/server/actions/planning';
import { DEBT_KIND_LABEL, DEBT_KINDS } from '@/lib/constants';
import { dateLabel, today } from '@/lib/dates';
import { toInputValue } from '@/lib/money';
import { projectPayoff } from '@/lib/projections';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { Disclosure, Empty, Field, Money, PageHeader, Pct, Progress, Section } from '@/components/ui';

export const metadata = { title: 'Deudas' };

export default async function DeudasPage() {
  await requireAuth();
  const t = today();
  const [debts, accounts] = await Promise.all([listDebts(db, t), listAccountsWithBalances(db)]);
  const liabilityAccounts = accounts.filter((a) => a.isLiability);
  const active = debts.filter((d) => d.status === 'active');
  const total = active.reduce((s, d) => s + d.balanceMinor, 0);
  const monthly = active.reduce((s, d) => s + (d.paymentMinor ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Deudas"
        lead="Tarjetas y créditos con su tasa efectiva anual (EA). Ves cuándo terminas de pagar y cuánto te cuestan en intereses."
      />

      <dl className="mb-8 grid max-w-xl grid-cols-2 gap-4">
        <div>
          <dt className="text-sm text-ink-soft">Debes en total</dt>
          <dd className="font-serif text-3xl">
            <Money minor={total} tone={total ? 'out' : 'neutral'} />
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink-soft">Cuotas al mes</dt>
          <dd className="font-serif text-3xl">
            <Money minor={monthly} />
          </dd>
        </div>
      </dl>

      {debts.length === 0 ? <Empty>Sin deudas registradas. Si tienes tarjeta de crédito, regístrala para ver cuánto te cuesta.</Empty> : null}

      <ul className="mb-10 space-y-6">
        {debts.map((d) => {
          // Escenario: pagar 25 % más cada mes.
          const faster = d.paymentMinor && d.balanceMinor > 0 ? projectPayoff(d.balanceMinor, d.rateEa, Math.round(d.paymentMinor * 1.25), t) : null;
          const saved = faster?.totalInterest != null && d.totalInterestMinor != null ? d.totalInterestMinor - Math.round(faster.totalInterest) : null;
          return (
            <li key={d.id} className="rounded-lg border border-rule bg-sheet p-5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <h2 className="font-serif text-xl">{d.name}</h2>
                  <p className="text-sm text-ink-soft">
                    {DEBT_KIND_LABEL[d.kind]}, {(d.rateEa * 100).toFixed(2).replace('.', ',')} % EA
                    {d.paymentDay ? `, pagas el día ${d.paymentDay}` : ''}
                    {d.accountId ? ', saldo tomado de su cuenta' : ''}
                  </p>
                </div>
                <p className="text-right">
                  <span className="font-serif text-2xl">
                    <Money minor={d.balanceMinor} tone={d.balanceMinor ? 'out' : 'neutral'} />
                  </span>
                  <span className="block text-sm text-ink-soft">
                    pagado <Pct value={d.paidPct} /> de <Money minor={d.originalMinor} tone="neutral" />
                  </span>
                </p>
              </div>
              <Progress value={d.paidPct} label={`Avance de pago de ${d.name}`} />

              <div className="mt-4 space-y-1 text-sm">
                {d.balanceMinor === 0 ? (
                  <p className="text-ledger">Pagada.</p>
                ) : d.paymentMinor == null ? (
                  <p className="text-ink-soft">Escribe tu cuota mensual para calcular cuándo terminas.</p>
                ) : d.monthsLeft == null ? (
                  <p className="text-red">
                    Con <Money minor={d.paymentMinor} tone="neutral" /> al mes la deuda no baja: los intereses son <Money minor={d.interestOnlyMinor} tone="neutral" /> al
                    mes. Paga más que eso.
                  </p>
                ) : (
                  <>
                    <p>
                      Pagando <Money minor={d.paymentMinor} tone="neutral" /> al mes terminas en <strong>{dateLabel(d.payoffDate!)}</strong> ({d.monthsLeft} meses) y pagas{' '}
                      <Money minor={d.totalInterestMinor} tone="neutral" /> en intereses.
                    </p>
                    {faster?.months != null && saved != null && saved > 0 ? (
                      <p className="text-ledger">
                        Si pagas <Money minor={Math.round(d.paymentMinor * 1.25)} tone="neutral" /> (25 % más) terminas en {faster.months} meses y te ahorras{' '}
                        <Money minor={saved} tone="neutral" /> de intereses.
                      </p>
                    ) : null}
                  </>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-4">
                <ActionForm action={updateDebtAction} resetOnSuccess={false} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={d.id} />
                  <Field label="Cuota mensual">
                    <input
                      name="payment"
                      inputMode="decimal"
                      defaultValue={d.paymentMinor ? toInputValue(d.paymentMinor) : ''}
                      className="field num w-40"
                    />
                  </Field>
                  {!d.accountId ? (
                    <Field label="Saldo hoy">
                      <input name="balance" inputMode="decimal" defaultValue={toInputValue(d.balanceMinor)} className="field num w-40" />
                    </Field>
                  ) : null}
                  <SubmitButton variant="quiet">Actualizar</SubmitButton>
                </ActionForm>
                <ActionForm action={deleteDebtAction} confirm={`¿Borrar "${d.name}"? No borra los movimientos de su cuenta.`} className="ml-auto">
                  <input type="hidden" name="id" value={d.id} />
                  <SubmitButton variant="danger">Borrar</SubmitButton>
                </ActionForm>
              </div>
            </li>
          );
        })}
      </ul>

      <Section title="Nueva deuda">
        <Disclosure summary="Registrar una tarjeta o crédito" open={debts.length === 0}>
          <ActionForm action={createDebtAction} className="grid gap-3 md:grid-cols-3">
            <Field label="Nombre">
              <input name="name" required maxLength={60} placeholder="Tarjeta Nu, Crédito moto…" className="field" />
            </Field>
            <Field label="Tipo">
              <select name="kind" className="field" defaultValue="credit_card">
                {DEBT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {DEBT_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tasa (% EA)" hint="Está en el extracto. La usura vigente es el tope legal.">
              <input name="rateEa" required inputMode="decimal" placeholder="28,5" className="field num" />
            </Field>
            <Field label="Cuenta asociada (opcional)" hint="Si la eliges, el saldo se toma de tus movimientos.">
              <select name="accountId" className="field" defaultValue="">
                <option value="">Ninguna: escribo el saldo</option>
                {liabilityAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Saldo que debes hoy" hint="Solo si no elegiste cuenta.">
              <input name="balance" inputMode="decimal" placeholder="3.500.000" className="field num" />
            </Field>
            <Field label="Monto original (o cupo usado)">
              <input name="original" required inputMode="decimal" placeholder="5.000.000" className="field num" />
            </Field>
            <Field label="Cuota mensual (opcional)">
              <input name="payment" inputMode="decimal" placeholder="450.000" className="field num" />
            </Field>
            <Field label="Día de pago (opcional)">
              <input name="paymentDay" type="number" min={1} max={31} className="field" />
            </Field>
            <div className="md:col-span-3">
              <SubmitButton>Registrar deuda</SubmitButton>
            </div>
          </ActionForm>
        </Disclosure>
      </Section>
    </>
  );
}
