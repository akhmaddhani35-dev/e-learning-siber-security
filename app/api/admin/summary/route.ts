import { NextRequest, NextResponse } from 'next/server';
import { requireAdminUser } from '../../../../lib/admin-auth';
import { getDashboardSummary } from '../../../../lib/admin-service';

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const summary = await getDashboardSummary();
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal memuat ringkasan dashboard admin.';
    const status = message.includes('ditolak') || message.includes('tidak ditemukan') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
