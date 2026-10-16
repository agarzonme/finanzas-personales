import { type NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, authEnabled, authMisconfigured, verifySession } from './server/session';

/**
 * Primera barrera: si hay contraseña configurada y no hay sesión válida, manda a /login.
 * Cada página y acción vuelve a verificar con requireAuth(); esto solo evita trabajo inútil.
 */
export async function proxy(req: NextRequest) {
  const problem = authMisconfigured();
  if (problem) return new NextResponse(`Configuración incompleta: ${problem}`, { status: 503 });
  if (!authEnabled()) return NextResponse.next();

  const isLogin = req.nextUrl.pathname === '/login';
  const ok = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!ok && !isLogin) return NextResponse.redirect(new URL('/login', req.nextUrl));
  if (ok && isLogin) return NextResponse.redirect(new URL('/', req.nextUrl));
  return NextResponse.next();
}

export const config = {
  // Todo menos archivos estáticos, íconos y el manifiesto de la app instalable.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest).*)'],
};
