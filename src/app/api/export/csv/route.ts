import { db } from '@/server/db/client';
import { requireAuth } from '@/server/auth';
import { transactionsToCsv } from '@/server/services/backup';
import { listTransactions } from '@/server/services/reports';
import { isMonthKey } from '@/lib/dates';

export async function GET(req: Request) {
  try {
    await requireAuth({ redirectToLogin: false });
  } catch {
    return new Response('No autorizado', { status: 401 });
  }
  const month = new URL(req.url).searchParams.get('month');
  const rows = await listTransactions(db, { month: month && isMonthKey(month) ? month : undefined, limit: 100_000 });
  return new Response(transactionsToCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="movimientos${month ? `-${month}` : ''}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
