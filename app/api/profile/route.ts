import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '../../../lib/admin-auth';
import { getUserProfile, updateUserProfile } from '../../../lib/profile-service';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const profile = await getUserProfile(actor.uid);
    return NextResponse.json({ profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal memuat profil pengguna.';
    const status = message.includes('tidak ditemukan') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const body = (await request.json()) as { userId?: unknown; username?: unknown; email?: unknown };
    const authorization = request.headers.get('authorization');
    const currentIdToken = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';

    if (body.userId !== actor.uid) {
      return NextResponse.json({ error: 'Anda hanya bisa mengubah profil sendiri.' }, { status: 403 });
    }

    if (typeof body.username !== 'string' || typeof body.email !== 'string') {
      return NextResponse.json({ error: 'Username dan email wajib diisi.' }, { status: 400 });
    }

    const profile = await updateUserProfile(
      actor.uid,
      {
        username: body.username,
        email: body.email,
      },
      currentIdToken
    );

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal memperbarui profil pengguna.';
    const status = message.includes('valid') ? 400 : message.includes('Anda hanya') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
