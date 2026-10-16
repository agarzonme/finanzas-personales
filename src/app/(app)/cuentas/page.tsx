import { db } from '@/server/db/client';
import { requireAuth } from '@/server/auth';
import { listAccountsWithBalances } from '@/server/services/accounts';
import { computePositions } from '@/server/services/investments';
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPES, CURRENCIES } from '@/lib/constants';
import { Disclosure, Field, Money, PageHeader, Section } from '@/components/ui';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { createAccountAction } from '@/server/actions/accounts';
import { AccountRow } from './AccountRow';

export const metadata = { title: 'Cuentas' };

export default async function CuentasPage() {
  await requireAuth();
  const [accounts, positions] = await Promise.all([listAccountsWithBalances(db, { includeArchived: true }), computePositions(db)]);
  const active = accounts.filter((a) => !a.archived);
  const groups = [
    { title: 'Cuentas y efectivo', items: active.filter((a) => !a.isLiability && a.type !== 'brokerage') },
    { title: 'Tarjetas y créditos', items: active.filter((a) => a.isLiability) },
    { title: 'Brokers (efectivo disponible)', items: active.filter((a) => a.type === 'brokerage') },
  ];
  const investedBy = new Map<string, number>();
  for (const p of positions) investedBy.set(p.accountId, (investedBy.get(p.accountId) ?? 0) + (p.valueBaseMinor ?? 0));
  const archived = accounts.filter((a) => a.archived);

  return (
    <>
      <PageHeader
        title="Cuentas"
        lead="El saldo de cada cuenta es tu saldo inicial más todo lo que registras. Si no cuadra con el banco, usa «Ajustar al saldo real»."
      />

      {groups.map((g) =>
        g.items.length ? (
          <Section
            key={g.title}
            title={g.title}
            aside={<Money minor={g.items.reduce((s, a) => s + (a.balanceBaseMinor ?? 0), 0)} />}
          >
            <ul className="ledger-rows">
              {g.items.map((a) => (
                <AccountRow key={a.id} account={a} investedBaseMinor={investedBy.get(a.id) ?? null} />
              ))}
            </ul>
          </Section>
        ) : null,
      )}

      <Section title="Nueva cuenta">
        <Disclosure summary="Agregar una cuenta, tarjeta, bolsillo o broker">
          <ActionForm action={createAccountAction} className="grid gap-3 md:grid-cols-3">
            <Field label="Nombre">
              <input name="name" required maxLength={60} placeholder="Davivienda, Bolsillo viaje, Nequi…" className="field" />
            </Field>
            <Field label="Tipo">
              <select name="type" className="field" defaultValue="checking">
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ACCOUNT_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Moneda">
              <select name="currency" className="field" defaultValue="COP">
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Saldo actual" hint="En tarjetas y créditos, escribe lo que debes.">
              <input name="opening" inputMode="decimal" placeholder="0" className="field num" />
            </Field>
            <Field label="Banco o entidad (opcional)">
              <input name="institution" maxLength={40} className="field" />
            </Field>
            <Field label="Cómo la llamas" hint="Separadas por coma. Sirven para el registro rápido: «con nequi».">
              <input name="aliases" placeholder="nequi, celular" className="field" />
            </Field>
            <input type="hidden" name="includeInNetWorth" value="on" />
            <div className="md:col-span-3">
              <SubmitButton>Crear cuenta</SubmitButton>
            </div>
          </ActionForm>
        </Disclosure>
      </Section>

      {archived.length ? (
        <Section title="Archivadas">
          <ul className="ledger-rows text-ink-soft">
            {archived.map((a) => (
              <AccountRow key={a.id} account={a} investedBaseMinor={null} />
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
