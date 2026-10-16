'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Resumen', short: 'Resumen', primary: true },
  { href: '/movimientos', label: 'Movimientos', short: 'Movim.', primary: true },
  { href: '/cuentas', label: 'Cuentas', short: 'Cuentas', primary: true },
  { href: '/presupuestos', label: 'Presupuestos', short: 'Presup.', primary: true },
  { href: '/metas', label: 'Metas', short: 'Metas', primary: true },
  { href: '/deudas', label: 'Deudas', short: 'Deudas', primary: false },
  { href: '/inversiones', label: 'Inversiones', short: 'Invers.', primary: false },
  { href: '/ajustes', label: 'Ajustes', short: 'Ajustes', primary: false },
];

export function Nav({ authEnabled, logout }: { authEnabled: boolean; logout: () => Promise<void> }) {
  const path = usePathname();
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  return (
    <>
      {/* Escritorio: columna lateral fija */}
      <nav aria-label="Secciones" className="hidden w-52 shrink-0 border-r border-rule px-4 py-6 md:block">
        <Link href="/" className="mb-8 block font-serif text-xl">
          Mis finanzas
        </Link>
        <ul className="space-y-1">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active(l.href) ? 'page' : undefined}
                className={`block rounded-md px-3 py-2 text-sm ${active(l.href) ? 'bg-ledger-tint font-medium text-ledger' : 'text-ink-soft hover:text-ink'}`}
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        {authEnabled ? (
          <form action={logout} className="mt-8">
            <button className="px-3 text-sm text-ink-soft hover:text-ink">Cerrar sesión</button>
          </form>
        ) : null}
      </nav>

      {/* Celular: barra inferior con desplazamiento horizontal */}
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-sheet/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="flex overflow-x-auto">
          {LINKS.map((l) => (
            <li key={l.href} className="shrink-0">
              <Link
                href={l.href}
                aria-current={active(l.href) ? 'page' : undefined}
                className={`block px-4 py-3 text-sm ${active(l.href) ? 'font-medium text-ledger' : 'text-ink-soft'}`}
              >
                {l.short}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
