import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '../../../../lib/admin-auth';
import { listFirestoreCollection, readFromFirestore, writeToFirestore } from '../../../../lib/firebase-admin';

type AttendanceStatus = 'hadir' | 'izin' | 'tidak_hadir';

interface AttendanceSubmitPayload {
  sessionId?: unknown;
  userId?: unknown;
  status?: unknown;
  reason?: unknown;
}

interface AttendanceSessionRecord {
  id: string;
  deadline: string;
}

interface AttendanceRecord {
  id: string;
  session_id: string;
  user_id: string;
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

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const actorUser = await readFromFirestore<UserRecord>(`users/${actor.uid}`);

    if (!actorUser || actorUser.role !== 'mahasiswa') {
      return NextResponse.json({ error: 'Hanya mahasiswa yang dapat mengirim absensi.' }, { status: 403 });
    }

    const body = (await request.json()) as AttendanceSubmitPayload;
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const status = body.status === 'izin' || body.status === 'hadir' || body.status === 'tidak_hadir'
      ? body.status
      : 'hadir';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!sessionId || !userId || userId !== actor.uid) {
      return NextResponse.json({ error: 'Data absensi tidak valid.' }, { status: 400 });
    }

    if (status === 'izin' && !reason) {
      return NextResponse.json({ error: 'Alasan wajib diisi untuk status izin.' }, { status: 400 });
    }

    const session = await readFromFirestore<AttendanceSessionRecord>(`attendance_sessions/${sessionId}`);
    if (!session) {
      return NextResponse.json({ error: 'Sesi absensi tidak ditemukan.' }, { status: 404 });
    }

    if (isDeadlinePassed(session.deadline)) {
      return NextResponse.json({ error: 'Absensi sudah melewati deadline.' }, { status: 409 });
    }

    const existingAttendances = await listFirestoreCollection<AttendanceRecord>('attendances');
    if (existingAttendances.some((item) => item.session_id === sessionId && item.user_id === userId)) {
      return NextResponse.json({ error: 'Anda sudah mengisi absensi untuk sesi ini.' }, { status: 409 });
    }

    const attendanceId = `${sessionId}_${userId}`;
    await writeToFirestore('attendances', attendanceId, {
      id: attendanceId,
      session_id: sessionId,
      user_id: userId,
      user_email: actor.email ?? actorUser.email ?? null,
      status,
      reason: status === 'izin' ? reason : null,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, id: attendanceId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal mengirim absensi.';
    const status = message.includes('ditolak') ? 403 : message.includes('Token autentikasi') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
