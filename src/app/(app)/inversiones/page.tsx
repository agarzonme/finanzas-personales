import Link from 'next/link';
import { db } from '@/server/db/client';
import { requireAuth } from '@/server/auth';
import { computePositions, dividendsLast12m, recentTrades } from '@/server/services/investments';
import { listAccountsWithBalances } from '@/server/services/accounts';
import { createTradeAction, deleteTradeAction, updatePriceAction } from '@/server/actions/investments';
import { ASSET_CLASS_LABEL, ASSET_CLASSES } from '@/lib/constants';
import { dateLabel, today } from '@/lib/dates';
import { decimalToInput, formatMoney, formatNumber } from '@/lib/money';
import { ActionForm, SubmitButton } from '@/components/ActionForm';
import { Disclosure, Empty, Field, Money, PageHeader, Pct, Section } from '@/components/ui';

export const metadata = { title: 'Inversiones' };

export default async function InversionesPage() {
  await requireAuth();
  const t = today();
  const [positions, accounts, trades, dividends] = await Promise.all([computePositions(db), listAccountsWithBalances(db), recentTrades(db), dividendsLast12m(db, t)]);
  const brokers = accounts.filter((a) => a.type === 'brokerage');
  const value = positions.reduce((s, p) => s + (p.valueBaseMinor ?? 0), 0);
  const cost = positions.reduce((s, p) => s + (p.costBaseMinor ?? 0), 0);
  const cash = brokers.reduce((s, a) => s + (a.balanceBaseMinor ?? 0), 0);

  const byClass = new Map<string, number>();
  for (const p of positions) byClass.set(p.assetClass, (byClass.get(p.assetClass) ?? 0) + (p.valueBaseMinor ?? 0));
  const allocation = [...byClass.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader
        title="Inversiones"
        lead="Registra tus compras y ventas de Hapi, Interactive Brokers o cualquier broker, y actualiza los precios cuando revises tu portafolio."
      />

      <dl className="mb-8 grid max-w-3xl grid-cols-2 gap-4 md:grid-cols-4">
        <div>
          <dt className="text-sm text-ink-soft">Valor de mercado</dt>
          <dd className="font-serif text-2xl">
            <Money minor={value} />
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink-soft">Ganancia sin realizar</dt>
          <dd className="font-serif text-2xl">
            <Money minor={value - cost} signed tone={value - cost >= 0 ? 'in' : 'out'} />{' '}
            <span className="text-base">
              (<Pct value={cost ? (value - cost) / cost : null} digits={1} />)
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink-soft">Efectivo en brokers</dt>
          <dd className="font-serif text-2xl">
            <Money minor={cash} />
          </dd>
        </div>
        <div>
          <dt className="text-sm text-ink-soft">Dividendos 12 meses</dt>
          <dd className="font-serif text-2xl">
            <Money minor={dividends} />
          </dd>
        </div>
      </dl>

      {allocation.length ? (
        <Section title="Distribución por tipo de activo">
          <div className="mb-2 flex h-4 overflow-hidden rounded-full" role="img" aria-label="Distribución del portafolio por tipo de activo">
            {allocation.map(([cls, v], i) => (
              <div key={cls} style={{ width: `${(v / value) * 100}%`, opacity: 1 - i * 0.18 }} className="bg-ledger first:rounded-l-full last:rounded-r-full" />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {allocation.map(([cls, v], i) => (
              <li key={cls} className="flex items-center gap-2">
                <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-ledger" style={{ opacity: 1 - i * 0.18 }} />
                {ASSET_CLASS_LABEL[cls as keyof typeof ASSET_CLASS_LABEL]} <Pct value={v / value} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Posiciones" aside="El precio se actualiza a mano; IBKR y Hapi lo muestran en su app.">
        {positions.length === 0 ? (
          <Empty>Sin posiciones. Registra tu primera compra abajo o escribe «Compré 2 VOO a 510 USD» en el registro rápido.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-ink-soft">
                <tr className="border-b border-rule-strong">
                  <th className="py-2 font-normal">Activo</th>
                  <th className="py-2 text-right font-normal">Cantidad</th>
                  <th className="py-2 text-right font-normal">Costo prom.</th>
                  <th className="py-2 text-right font-normal">Valor</th>
                  <th className="py-2 text-right font-normal">Ganancia</th>
                  <th className="py-2 pl-4 font-normal">Precio actual</th>
                </tr>
              </thead>
              <tbody className="ledger-rows">
                {positions.map((p) => (
                  <tr key={`${p.accountId}-${p.securityId}`} className="border-t border-rule align-top">
                    <td className="py-3">
                      <span className="font-medium">{p.symbol}</span>
                      <span className="block text-xs text-ink-soft">
                        {p.accountName}, {ASSET_CLASS_LABEL[p.assetClass]}
                      </span>
                    </td>
                    <td className="num py-3 text-right">{formatNumber(p.quantity, 6)}</td>
                    <td className="num py-3 text-right">{formatMoney(Math.round(p.costMinor / p.quantity), p.currency)}</td>
                    <td className="py-3 text-right">
                      <Money minor={p.valueMinor} currency={p.currency} />
                      <span className="block text-xs text-ink-soft">
                        <Money minor={p.valueBaseMinor} tone="neutral" />
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <Money minor={p.pnlMinor} currency={p.currency} signed tone={p.pnlMinor >= 0 ? 'in' : 'out'} />
                      <span className="block text-xs">
                        <Pct value={p.pnlPct} digits={1} />
                      </span>
                    </td>
                    <td className="py-3 pl-4">
                      <ActionForm action={updatePriceAction} resetOnSuccess={false} hideSuccess className="flex gap-2">
                        <input type="hidden" name="securityId" value={p.securityId} />
                        <input type="hidden" name="date" value={t} />
                        <input
                          name="price"
                          inputMode="decimal"
                          defaultValue={decimalToInput(p.price)}
                          aria-label={`Precio actual de ${p.symbol}`}
                          className="field num w-28"
                        />
                        <SubmitButton variant="quiet">Ok</SubmitButton>
                      </ActionForm>
                      <span className="mt-1 block text-xs text-ink-soft">{p.priceDate ? `al ${dateLabel(p.priceDate)}` : ''}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Registrar compra o venta">
        {brokers.length === 0 ? (
          <Empty>
            Primero crea una cuenta de tipo «Inversiones (broker)» en <Link href="/cuentas" className="text-ledger underline">Cuentas</Link>.
          </Empty>
        ) : (
          <Disclosure summary="Nueva operación" open={positions.length === 0}>
            <ActionForm action={createTradeAction} className="grid gap-3 md:grid-cols-4">
              <Field label="Operación">
                <select name="side" className="field" defaultValue="buy">
                  <option value="buy">Compra</option>
                  <option value="sell">Venta</option>
                </select>
              </Field>
              <Field label="Broker">
                <select name="accountId" className="field">
                  {brokers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.currency})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Símbolo">
                <input name="symbol" required maxLength={15} placeholder="VOO" className="field uppercase" />
              </Field>
              <Field label="Tipo de activo">
                <select name="assetClass" className="field" defaultValue="etf">
                  {ASSET_CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {ASSET_CLASS_LABEL[c]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cantidad" hint="Acepta fracciones: 0,25">
                <input name="quantity" required inputMode="decimal" className="field num" />
              </Field>
              <Field label="Precio por unidad">
                <input name="price" required inputMode="decimal" placeholder="510,25" className="field num" />
              </Field>
              <Field label="Comisión">
                <input name="fees" inputMode="decimal" placeholder="0" className="field num" />
              </Field>
              <Field label="Fecha">
                <input name="date" type="date" defaultValue={t} className="field" />
              </Field>
              <p className="text-xs text-ink-soft md:col-span-4">
                La compra descuenta el efectivo del broker. Para fondear el broker registra antes una transferencia, por ejemplo «Pasé 2.000.000 de
                Bancolombia a Hapi». Los dividendos se anotan como ingreso en «Rendimientos y dividendos».
              </p>
              <div className="md:col-span-4">
                <SubmitButton>Registrar operación</SubmitButton>
              </div>
            </ActionForm>
          </Disclosure>
        )}
      </Section>

      {trades.length ? (
        <Section title="Últimas operaciones">
          <ul className="ledger-rows text-sm">
            {trades.map((tr) => (
              <li key={tr.id} className="flex items-center justify-between gap-4 py-2">
                <span>
                  {dateLabel(tr.date)}: {tr.side === 'buy' ? 'compra' : 'venta'} de {formatNumber(tr.quantity, 6)} {tr.symbol} a {formatNumber(tr.price, 4)} {tr.currency} en{' '}
                  {tr.accountName}
                </span>
                {tr.transactionId ? (
                  <ActionForm action={deleteTradeAction} confirm="¿Borrar esta operación? El efectivo vuelve a la cuenta del broker.">
                    <input type="hidden" name="transactionId" value={tr.transactionId} />
                    <SubmitButton variant="danger">Borrar</SubmitButton>
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
