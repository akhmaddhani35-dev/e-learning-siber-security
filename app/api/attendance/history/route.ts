import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '../../../../lib/admin-auth';
import { listFirestoreCollection, readFromFirestore } from '../../../../lib/firebase-admin';

type AttendanceStatus = 'hadir' | 'izin' | 'tidak_hadir';

interface AttendanceSessionRecord {
  id: string;
  course_id: string;
  title: string;
  date: string;
  deadline: string;
  created_by: string;
  created_at?: string;
}

interface AttendanceRecord {
  id: string;
  session_id: string;
  user_id: string;
  status: AttendanceStatus;
  reason: string | null;
  timestamp?: string | null;
  user_email?: string | null;
}

interface UserRecord {
  role?: string;
}

function isDeadlinePassed(deadline: string | null | undefined) {
  if (!deadline) return false;
  const date = new Date(deadline);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const actorUser = await readFromFirestore<UserRecord>(`users/${actor.uid}`);

    if (!actorUser) {
      return NextResponse.json({ error: 'Data pengguna tidak ditemukan.' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId')?.trim() || 'cyber-security-default';
    const requestedUserId = searchParams.get('userId')?.trim() || actor.uid;

    if (actorUser.role !== 'admin' && actorUser.role !== 'dosen' && requestedUserId !== actor.uid) {
      return NextResponse.json({ error: 'Akses riwayat absensi ditolak.' }, { status: 403 });
    }

    const [sessions, attendances] = await Promise.all([
      listFirestoreCollection<AttendanceSessionRecord>('attendance_sessions'),
      listFirestoreCollection<AttendanceRecord>('attendances'),
    ]);

    const filteredSessions = sessions
      .filter((item) => item.course_id === courseId)
      .sort((left, right) => right.date.localeCompare(left.date));

    const attendanceBySession = new Map(
      attendances
        .filter((item) => item.user_id === requestedUserId)
        .map((item) => [item.session_id, item] as const),
    );

    const history = filteredSessions.map((session) => {
      const attendance = attendanceBySession.get(session.id);
      return {
        session,
        attendance: attendance ?? (isDeadlinePassed(session.deadline)
          ? {
              id: `${session.id}_${requestedUserId}`,
              session_id: session.id,
              user_id: requestedUserId,
              status: 'tidak_hadir',
              reason: null,
              timestamp: null,
              user_email: actor.email,
            }
          : null),
      };
    });

    return NextResponse.json({ history });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal memuat riwayat absensi.';
    const status = message.includes('ditolak') ? 403 : message.includes('Token autentikasi') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
