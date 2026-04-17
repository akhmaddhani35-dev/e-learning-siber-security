import { NextRequest, NextResponse } from 'next/server';
import { createUser, deleteUser, getAllUsers, resetUserPassword, updateUserRole, type UserRole } from '../../../../lib/admin-service';
import { requireAdminUser } from '../../../../lib/admin-auth';

function isValidRole(role: unknown): role is UserRole {
  return role === 'admin' || role === 'dosen' || role === 'mahasiswa';
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const users = await getAllUsers();
    return NextResponse.json({ users });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal memuat data user.';
    const status = message.includes('ditolak') || message.includes('tidak ditemukan') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminUser = await requireAdminUser(request);
    const body = (await request.json()) as {
      email?: unknown;
      password?: unknown;
      role?: unknown;
      username?: unknown;
    };

    if (typeof body.email !== 'string' || typeof body.password !== 'string' || !isValidRole(body.role)) {
      return NextResponse.json({ error: 'Email, password, dan role valid wajib diisi.' }, { status: 400 });
    }

    await createUser(
      {
        email: body.email,
        password: body.password,
        role: body.role,
        username: typeof body.username === 'string' ? body.username : undefined,
      },
      adminUser
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal membuat user baru.';
    const status =
      message.includes('wajib diisi') ||
      message.includes('valid') ||
      message.includes('minimal 6')
        ? 400
        : message.includes('EMAIL_EXISTS')
          ? 409
          : message.includes('ditolak')
            ? 403
            : 500;
    return NextResponse.json({ error: message.includes('EMAIL_EXISTS') ? 'Email sudah digunakan.' : message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const adminUser = await requireAdminUser(request);
    const body = (await request.json()) as { id?: unknown; role?: unknown; password?: unknown };

    if (typeof body.id !== 'string' || !body.id.trim()) {
      return NextResponse.json({ error: 'ID user wajib diisi.' }, { status: 400 });
    }

    if (typeof body.password === 'string') {
      await resetUserPassword(body.id, body.password, adminUser);
      return NextResponse.json({ success: true });
    }

    if (!isValidRole(body.role)) {
      return NextResponse.json({ error: 'Role valid wajib diisi.' }, { status: 400 });
    }

    await updateUserRole(body.id, body.role, adminUser);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal memperbarui data user.';
    const status =
      message.includes('minimal 6') || message.includes('valid') || message.includes('wajib diisi')
        ? 400
        : message.includes('ditolak') || message.includes('tidak ditemukan')
          ? 403
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const adminUser = await requireAdminUser(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID user wajib diisi.' }, { status: 400 });
    }

    if (id === adminUser.uid) {
      return NextResponse.json({ error: 'Admin tidak dapat menghapus akun sendiri.' }, { status: 400 });
    }

    await deleteUser(id, adminUser);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal menghapus user.';
    const status = message.includes('ditolak') || message.includes('tidak ditemukan') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
