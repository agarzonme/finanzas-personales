import { db } from '@/server/db/client';
import { requireAuth } from '@/server/auth';
import { exportBackup } from '@/server/services/backup';
import { today } from '@/lib/dates';

export async function GET() {
  try {
    await requireAuth({ redirectToLogin: false });
  } catch {
    return new Response('No autorizado', { status: 401 });
  }
  const backup = await exportBackup(db);
  return new Response(JSON.stringify(backup), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="respaldo-finanzas-${today()}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
