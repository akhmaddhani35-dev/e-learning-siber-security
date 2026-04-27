import { NextRequest, NextResponse } from 'next/server';
import { requireTeacherUser } from '../../../../lib/admin-auth';
import { listFirestoreCollection, readFromFirestore } from '../../../../lib/firebase-admin';

type AttendanceStatus = 'hadir' | 'izin' | 'tidak_hadir';

interface AttendanceSessionRecord {
  id: string;
  deadline: string;
}

interface AttendanceRecord {
  id: string;
  session_id: string;
  user_id: string;
  status: AttendanceStatus;
  reason: string | null;
  timestamp?: string | null;
}

interface UserRecord {
  uid?: string;
  email?: string | null;
  role?: string;
}

function isDeadlinePassed(deadline: string | null | undefined) {
  if (!deadline) return false;
  const date = new Date(deadline);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

export async function GET(request: NextRequest) {
  try {
    await requireTeacherUser(request);
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId')?.trim() || '';

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId wajib diisi.' }, { status: 400 });
    }

    const session = await readFromFirestore<AttendanceSessionRecord>(`attendance_sessions/${sessionId}`);
    if (!session) {
      return NextResponse.json({ error: 'Sesi absensi tidak ditemukan.' }, { status: 404 });
    }

    const [users, attendances] = await Promise.all([
      listFirestoreCollection<UserRecord>('users'),
      listFirestoreCollection<AttendanceRecord>('attendances'),
    ]);

    const students = users.filter((item) => item.role === 'mahasiswa');
    const attendanceByUser = new Map(
      attendances
        .filter((item) => item.session_id === sessionId)
        .map((item) => [item.user_id, item] as const),
    );

    const report = students.map((student) => {
      const attendance = student.uid ? attendanceByUser.get(student.uid) : undefined;
      return {
        user_id: student.uid ?? '',
        email: student.email ?? 'Tanpa email',
        status: attendance?.status ?? (isDeadlinePassed(session.deadline) ? 'tidak_hadir' : 'tidak_hadir'),
        reason: attendance?.reason ?? null,
        timestamp: attendance?.timestamp ?? null,
      };
    });

    return NextResponse.json({ report });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal memuat rekap absensi.';
    const status = message.includes('ditolak') ? 403 : message.includes('Token autentikasi') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
