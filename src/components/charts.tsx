'use client';

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '@/lib/money';
import { monthLabel, dateLabel } from '@/lib/dates';

const axis = { stroke: 'var(--ink-soft)', fontSize: 12 };
const compact = (v: number) => formatMoney(v * 100, 'COP', { compact: true });

function TooltipBox({ title, rows }: { title: string; rows: Array<{ label: string; value: number; color: string }> }) {
  return (
    <div className="rounded-md border border-rule bg-sheet px-3 py-2 text-sm shadow-sm">
      <p className="mb-1 font-medium">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="num flex justify-between gap-6">
          <span style={{ color: r.color }}>{r.label}</span>
          <span>{formatMoney(r.value * 100)}</span>
        </p>
      ))}
    </div>
  );
}

/** Ingresos vs. gastos por mes (valores en pesos, no centavos). */
export function CashflowChart({ data }: { data: Array<{ month: string; income: number; expenses: number }> }) {
  const hasData = data.some((d) => d.income || d.expenses);
  if (!hasData) return <p className="py-10 text-center text-ink-soft">Cuando registres ingresos y gastos verás aquí cómo cierra cada mes.</p>;
  return (
    <div className="h-64" role="img" aria-label="Ingresos y gastos de los últimos 12 meses">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--rule)" />
          <XAxis dataKey="month" tickFormatter={(m: string) => monthLabel(m).split(' ')[0]!} tick={axis} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={compact} tick={axis} axisLine={false} tickLine={false} width={64} />
          <Tooltip
            cursor={{ fill: 'var(--ledger-tint)' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox
                  title={monthLabel(String(label), true)}
                  rows={[
                    { label: 'Ingresos', value: Number(payload[0]?.value ?? 0), color: 'var(--ledger)' },
                    { label: 'Gastos', value: Number(payload[1]?.value ?? 0), color: 'var(--red)' },
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="income" name="Ingresos" fill="var(--ledger)" radius={[3, 3, 0, 0]} maxBarSize={22} />
          <Bar dataKey="expenses" name="Gastos" fill="var(--red)" radius={[3, 3, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Evolución del patrimonio neto (una foto por cada día que abres el resumen). */
export function NetWorthChart({ data }: { data: Array<{ date: string; netWorth: number }> }) {
  if (data.length < 2) return <p className="py-10 text-center text-ink-soft">La línea aparece desde el segundo día que abras el resumen.</p>;
  // Con rangos pequeños, "10,6 M" se repetiría en cada marca: usa más decimales.
  const values = data.map((d) => d.netWorth);
  const span = Math.max(...values) - Math.min(...values);
  const digits = span < 1_000_000 ? 2 : 1;
  const tick = (v: number) => `$${(v / 1_000_000).toLocaleString('es-CO', { minimumFractionDigits: digits, maximumFractionDigits: digits })} M`;
  return (
    <div className="h-56" role="img" aria-label="Evolución del patrimonio neto">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--rule)" />
          <XAxis dataKey="date" tickFormatter={(d: string) => dateLabel(d).split(' ').slice(0, 2).join(' ')} tick={axis} axisLine={false} tickLine={false} minTickGap={32} />
          <YAxis tickFormatter={tick} tick={axis} axisLine={false} tickLine={false} width={72} domain={['auto', 'auto']} tickCount={4} allowDecimals />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox title={dateLabel(String(label))} rows={[{ label: 'Patrimonio', value: Number(payload[0]?.value ?? 0), color: 'var(--ink)' }]} />
              ) : null
            }
          />
          <Line type="monotone" dataKey="netWorth" stroke="var(--ledger)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
