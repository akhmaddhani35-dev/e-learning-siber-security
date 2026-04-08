import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '../../../../lib/admin-auth';
import { changePassword } from '../../../../lib/profile-service';

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const body = (await request.json()) as {
      userId?: unknown;
      newPassword?: unknown;
    };

    if (body.userId !== actor.uid) {
      return NextResponse.json({ error: 'Anda hanya bisa mengubah password sendiri.' }, { status: 403 });
    }

    if (typeof body.newPassword !== 'string') {
      return NextResponse.json({ error: 'Password baru wajib diisi.' }, { status: 400 });
    }

    await changePassword(actor.uid, '', body.newPassword);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal mengubah password.';
    const status = message.includes('minimal') || message.includes('wajib') ? 400 : message.includes('Anda hanya') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
