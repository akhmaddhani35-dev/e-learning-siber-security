import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser, requireAuthenticatedUser } from '../../../lib/admin-auth';
import { getRoleActivityLogs, logRoleActivity, logUserLogin } from '../../../lib/admin-service';

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const logs = await getRoleActivityLogs();
    return NextResponse.json({ logs });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal memuat system log.';
    const status = message.includes('ditolak') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const body = (await request.json()) as { action?: unknown; metadata?: unknown };

    if (body.action === 'login') {
      await logUserLogin(actor);
      return NextResponse.json({ success: true });
    }

    if (typeof body.action !== 'string' || !body.action.trim()) {
      return NextResponse.json({ error: 'Action log tidak didukung.' }, { status: 400 });
    }

    if (!body.action.startsWith('mahasiswa.') && !body.action.startsWith('dosen.')) {
      return NextResponse.json({ error: 'Action log tidak didukung.' }, { status: 400 });
    }

    await logRoleActivity(
      actor,
      body.action,
      typeof body.metadata === 'object' && body.metadata !== null ? body.metadata as Record<string, unknown> : undefined
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal mencatat system log.';
    const status = message.includes('tidak ditemukan') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
