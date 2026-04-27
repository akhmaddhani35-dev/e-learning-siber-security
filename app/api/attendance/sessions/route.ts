import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherUser, requireAuthenticatedUser } from '../../../../lib/admin-auth';
import { listFirestoreCollection, writeToFirestore } from '../../../../lib/firebase-admin';

interface AttendanceSessionRecord {
  id: string;
  course_id: string;
  title: string;
  date: string;
  deadline: string;
  created_by: string;
  created_at?: string;
}

interface AttendanceSessionPayload {
  course_id?: unknown;
  title?: unknown;
  date?: unknown;
  deadline?: unknown;
  created_by?: unknown;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId')?.trim() || 'cyber-security-default';
    const sessions = await listFirestoreCollection<AttendanceSessionRecord>('attendance_sessions');
    const filtered = sessions
      .filter((item) => item.course_id === courseId)
      .sort((left, right) => right.date.localeCompare(left.date));

    return NextResponse.json({ sessions: filtered });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal memuat sesi absensi.';
    const status = message.includes('Token autentikasi') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireTeacherUser(request);
    const body = (await request.json()) as AttendanceSessionPayload;
    const courseId = typeof body.course_id === 'string' && body.course_id.trim() ? body.course_id.trim() : 'cyber-security-default';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const date = typeof body.date === 'string' ? body.date.trim() : '';
    const deadline = typeof body.deadline === 'string' ? body.deadline.trim() : '';

    if (!title || !date || !deadline) {
      return NextResponse.json({ error: 'Judul, tanggal, dan deadline absensi wajib diisi.' }, { status: 400 });
    }

    if (new Date(deadline).getTime() < new Date(date).getTime()) {
      return NextResponse.json({ error: 'Deadline tidak boleh lebih awal dari tanggal absensi.' }, { status: 400 });
    }

    const sessionId = crypto.randomUUID();
    await writeToFirestore('attendance_sessions', sessionId, {
      id: sessionId,
      course_id: courseId,
      title,
      date,
      deadline,
      created_by: actor.uid,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, id: sessionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal membuat sesi absensi.';
    const status = message.includes('ditolak') ? 403 : message.includes('Token autentikasi') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
