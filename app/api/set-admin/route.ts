import { writeToFirestore } from '../../../lib/firebase-admin';
import { NextRequest, NextResponse } from 'next/server';

const SETUP_SECRET = process.env.ADMIN_SETUP_SECRET;

export async function POST(request: NextRequest) {
  try {
    if (!SETUP_SECRET) {
      return NextResponse.json(
        { error: 'Konfigurasi ADMIN_SETUP_SECRET belum di-set di server' },
        { status: 500 }
      );
    }

    const body = (await request.json()) as { email?: unknown; secret?: unknown };
    const email = typeof body.email === 'string' ? body.email : '';
    const secret = typeof body.secret === 'string' ? body.secret : '';

    if (!email) {
      return NextResponse.json({ error: 'Email harus diisi' }, { status: 400 });
    }

    // Validate secret untuk keamanan
    if (secret !== SETUP_SECRET) {
      return NextResponse.json(
        { error: 'Secret key tidak valid' },
        { status: 403 }
      );
    }

    // Normalisasi email
    const normalizedEmail = email.toLowerCase().trim();

    if (normalizedEmail !== 'dhani1@gmail.com') {
      return NextResponse.json(
        { error: 'Hanya dhani1@gmail.com yang bisa diset sebagai admin melalui endpoint ini' },
        { status: 403 }
      );
    }

    // Tulis ke Firestore menggunakan REST API + service account JWT
    await writeToFirestore('adminEmails', normalizedEmail, {
      email: normalizedEmail,
      isAdmin: true,
      addedAt: new Date().toISOString(),
    });

    return NextResponse.json({ 
      success: true,
      message: `${normalizedEmail} sudah ditambahkan ke admin whitelist. Silakan login ulang untuk mendapat akses admin.`
    });

  } catch (error) {
    console.error('Error setting admin:', error);
    return NextResponse.json(
      { error: 'Gagal set admin', details: String(error) },
      { status: 500 }
    );
  }
}



