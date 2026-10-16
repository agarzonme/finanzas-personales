import { formatMoney, formatPct } from '@/lib/money';

export function PageHeader({ title, lead, children }: { title: string; lead?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-4">
      <div>
        <h1 className="font-serif text-3xl leading-tight">{title}</h1>
        {lead ? <p className="mt-1 max-w-prose text-ink-soft">{lead}</p> : null}
      </div>
      {children}
    </header>
  );
}

export function Section({
  title,
  aside,
  children,
  className = '',
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-10 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl">{title}</h2>
        {aside ? <div className="text-sm text-ink-soft">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Monto con color: verde si entra, rojo si sale, tinta si es neutro. */
export function Money({
  minor,
  currency = 'COP',
  tone = 'auto',
  className = '',
  signed = false,
}: {
  minor: number | null;
  currency?: string;
  tone?: 'auto' | 'neutral' | 'in' | 'out';
  className?: string;
  signed?: boolean;
}) {
  if (minor == null) return <span className={`num text-ink-soft ${className}`}>sin TRM</span>;
  const color =
    tone === 'neutral' ? '' : tone === 'in' ? 'text-ledger' : tone === 'out' ? 'text-red' : minor < 0 ? 'text-red' : '';
  return <span className={`num whitespace-nowrap ${color} ${className}`}>{formatMoney(minor, currency, { signed })}</span>;
}

export function Progress({ value, status = 'ok', label }: { value: number; status?: 'ok' | 'warning' | 'exceeded'; label: string }) {
  const pct = Math.max(0, Math.min(1, value));
  const color = status === 'exceeded' ? 'bg-red' : status === 'warning' ? 'bg-amber' : 'bg-ledger';
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className="h-2 w-full overflow-hidden rounded-full bg-rule"
    >
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct * 100}%` }} />
    </div>
  );
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block text-ink-soft">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-soft">{hint}</span> : null}
    </label>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-rule-strong px-4 py-6 text-center text-ink-soft">{children}</p>;
}

export function Pct({ value, digits = 0 }: { value: number | null; digits?: number }) {
  return <span className="num">{formatPct(value, digits)}</span>;
}

/** Bloque plegable para formularios secundarios: mantiene la pantalla limpia. */
export function Disclosure({ summary, children, open = false }: { summary: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-md border border-rule bg-sheet">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ledger marker:hidden">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
        {summary}
      </summary>
      <div className="border-t border-rule px-4 py-4">{children}</div>
    </details>
  );
}
