import { NextRequest, NextResponse } from 'next/server';
import { approveCourse, deleteCourse, getAllCourses } from '../../../../lib/admin-service';
import { requireAdminUser } from '../../../../lib/admin-auth';

export async function GET(request: NextRequest) {
  try {
    await requireAdminUser(request);
    const courses = await getAllCourses();
    return NextResponse.json({ courses });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal memuat data course.';
    const status = message.includes('ditolak') || message.includes('tidak ditemukan') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const adminUser = await requireAdminUser(request);
    const body = (await request.json()) as { id?: unknown };

    if (typeof body.id !== 'string' || !body.id.trim()) {
      return NextResponse.json({ error: 'ID course wajib diisi.' }, { status: 400 });
    }

    await approveCourse(body.id, adminUser);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal menyetujui course.';
    const status = message.includes('ditolak') || message.includes('tidak ditemukan') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const adminUser = await requireAdminUser(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID course wajib diisi.' }, { status: 400 });
    }

    await deleteCourse(id, adminUser);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal menghapus course.';
    const status = message.includes('ditolak') || message.includes('tidak ditemukan') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
