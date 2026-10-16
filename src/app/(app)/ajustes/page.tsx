import { desc, eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { categories, categoryRules, settings } from '@/server/db/schema';
import { requireAuth } from '@/server/auth';
import { authEnabled } from '@/server/session';
import { listAccountsWithBalances } from '@/server/services/accounts';
import { listRates } from '@/server/services/fx';
import { createCategoryAction, importBackupAction, setFxRateAction, updateDefaultsAction } from '@/server/actions/settings';
import { dateLabel, today } from '@/lib/dates';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { Disclosure, Field, PageHeader, Section } from '@/components/ui';

export const metadata = { title: 'Ajustes' };

export default async function AjustesPage() {
  await requireAuth();
  const [rates, accounts, [s], cats, rules] = await Promise.all([
    listRates(db, 10),
    listAccountsWithBalances(db),
    db.select().from(settings).where(eq(settings.id, 1)),
    db.select().from(categories).orderBy(categories.kind, categories.name),
    db
      .select({ pattern: categoryRules.pattern, category: categories.name, hits: categoryRules.hits, source: categoryRules.source })
      .from(categoryRules)
      .innerJoin(categories, eq(categories.id, categoryRules.categoryId))
      .where(eq(categoryRules.source, 'learned'))
      .orderBy(desc(categoryRules.hits))
      .limit(30),
  ]);
  const local = (process.env.DATABASE_URL ?? 'file:').startsWith('file:');

  const accountSelect = (name: string, label: string, value: string | null | undefined, filter: (a: (typeof accounts)[number]) => boolean, hint?: string) => (
    <Field label={label} hint={hint}>
      <select name={name} defaultValue={value ?? ''} className="field">
        <option value="">Ninguna</option>
        {accounts.filter(filter).map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <>
      <PageHeader title="Ajustes" />

      <Section title="Tasa de cambio (TRM)">
        <p className="mb-3 max-w-prose text-sm text-ink-soft">
          Las cuentas en dólares se convierten a pesos con la tasa más reciente. La TRM oficial del día está en la página del Banco de la
          República o de la Superfinanciera; actualízala cuando revises tus inversiones.
        </p>
        <ActionForm action={setFxRateAction} className="mb-4 flex flex-wrap items-end gap-2">
          <Field label="Moneda">
            <select name="currency" className="field w-28" defaultValue="USD">
              <option>USD</option>
              <option>EUR</option>
            </select>
          </Field>
          <Field label="Pesos por 1 unidad">
            <input name="rate" required inputMode="decimal" placeholder="3.950,25" className="field num w-40" />
          </Field>
          <Field label="Fecha">
            <input name="date" type="date" defaultValue={today()} className="field" />
          </Field>
          <SubmitButton>Guardar tasa</SubmitButton>
        </ActionForm>
        {rates.length ? (
          <ul className="ledger-rows max-w-md text-sm">
            {rates.map((r) => (
              <li key={`${r.currency}-${r.date}`} className="flex justify-between py-1.5">
                <span>
                  {r.currency}, {dateLabel(r.date)}
                </span>
                <span className="num">{r.rate.toLocaleString('es-CO', { maximumFractionDigits: 2 })}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-amber">Aún no hay tasas. Sin la TRM, Hapi e IBKR no suman a tu patrimonio.</p>
        )}
      </Section>

      <Section title="Cuentas por defecto del registro rápido">
        <ActionForm action={updateDefaultsAction} resetOnSuccess={false} className="grid gap-3 md:grid-cols-3">
          {accountSelect('defaultExpenseAccountId', 'Gastos sin cuenta mencionada', s?.defaultExpenseAccountId, (a) => true)}
          {accountSelect('defaultIncomeAccountId', 'Ingresos sin cuenta mencionada', s?.defaultIncomeAccountId, (a) => !a.isLiability)}
          {accountSelect('defaultCardAccountId', 'Tarjeta para «pagué la tarjeta»', s?.defaultCardAccountId, (a) => a.type === 'credit_card')}
          {accountSelect('defaultInvestmentAccountId', 'Broker para compras de acciones', s?.defaultInvestmentAccountId, (a) => a.type === 'brokerage')}
          {accountSelect('cashAccountId', 'Efectivo (para «saqué del cajero»)', s?.cashAccountId, (a) => a.type === 'cash')}
          <Field label="Tu nombre (opcional)">
            <input name="ownerName" defaultValue={s?.ownerName ?? ''} className="field" />
          </Field>
          <div className="md:col-span-3">
            <SubmitButton>Guardar preferencias</SubmitButton>
          </div>
        </ActionForm>
      </Section>

      <Section title="Categorías">
        <div className="mb-4 grid gap-6 md:grid-cols-2">
          {(['expense', 'income'] as const).map((kind) => (
            <div key={kind}>
              <h3 className="mb-2 text-sm text-ink-soft">{kind === 'expense' ? 'De gastos' : 'De ingresos'}</h3>
              <ul className="flex flex-wrap gap-2 text-sm">
                {cats
                  .filter((c) => c.kind === kind)
                  .map((c) => (
                    <li key={c.id} className="rounded-full border border-rule px-3 py-1">
                      {c.icon} {c.name}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
        <Disclosure summary="Crear categoría">
          <ActionForm action={createCategoryAction} className="flex flex-wrap items-end gap-2">
            <Field label="Nombre">
              <input name="name" required maxLength={40} className="field" />
            </Field>
            <Field label="Ícono (emoji)">
              <input name="icon" maxLength={8} className="field w-20" />
            </Field>
            <Field label="Tipo">
              <select name="kind" className="field" defaultValue="expense">
                <option value="expense">Gasto</option>
                <option value="income">Ingreso</option>
              </select>
            </Field>
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input type="checkbox" name="essential" /> Esencial
            </label>
            <SubmitButton>Crear</SubmitButton>
          </ActionForm>
        </Disclosure>
        {rules.length ? (
          <div className="mt-6">
            <h3 className="mb-2 text-sm text-ink-soft">Reglas que la app aprendió de tus correcciones</h3>
            <ul className="ledger-rows max-w-xl text-sm">
              {rules.map((r) => (
                <li key={r.pattern} className="flex justify-between gap-4 py-1.5">
                  <span>«{r.pattern}» va a {r.category}</span>
                  <span className="text-ink-soft">{r.hits} usos</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      <Section title="Respaldo de tus datos">
        <p className="mb-4 max-w-prose text-sm text-ink-soft">
          Descarga un respaldo cada mes y guárdalo en tu Drive o un USB. El mismo archivo sirve para pasar tus datos del computador a la
          versión en internet (o al revés).
        </p>
        <div className="mb-6 flex flex-wrap gap-3">
          <a href="/api/export" className="inline-flex min-h-10 items-center rounded-md bg-ledger px-4 text-sm font-medium text-sheet">
            Descargar respaldo completo
          </a>
          <a href="/api/export/csv" className="inline-flex min-h-10 items-center rounded-md border border-rule-strong px-4 text-sm hover:bg-ledger-tint">
            Descargar movimientos en CSV
          </a>
        </div>
        <Disclosure summary="Restaurar desde un respaldo">
          <ActionForm action={importBackupAction} className="space-y-3" confirm="Esto reemplaza TODOS tus datos actuales por los del archivo. ¿Continuar?">
            <Field label="Archivo .json">
              <input name="file" type="file" accept="application/json,.json" required className="text-sm" />
            </Field>
            <Field label="Escribe REEMPLAZAR para confirmar">
              <input name="confirm" required autoComplete="off" className="field max-w-xs" />
            </Field>
            <SubmitButton variant="quiet">Restaurar respaldo</SubmitButton>
          </ActionForm>
        </Disclosure>
      </Section>

      <Section title="Dónde viven tus datos">
        <p className="max-w-prose text-sm">
          {local
            ? 'En un archivo de tu computador (data/finanzas.db). Nada sale de tu equipo.'
            : 'En tu base de datos de Turso. Solo esta app tiene la llave para leerla.'}{' '}
          {authEnabled()
            ? 'La app pide contraseña para entrar.'
            : 'La app no pide contraseña: úsala solo en tu computador o en tu red de casa. Para publicarla en internet, configura APP_PASSWORD_HASH (ver README).'}
        </p>
      </Section>
    </>
  );
}
