import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

export const DEFAULT_COURSE_ID = 'cyber-security-default';

export type AttendanceStatus = 'hadir' | 'izin' | 'tidak_hadir';

export interface AttendanceSessionInput {
  course_id: string;
  title: string;
  date: string;
  deadline: string;
  created_by: string;
}

export interface AttendanceSession {
  id: string;
  course_id: string;
  title: string;
  date: string;
  deadline: string;
  created_by: string;
  created_at?: Timestamp | null;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  user_id: string;
  status: AttendanceStatus;
  reason: string | null;
  timestamp?: Timestamp | null;
  user_email?: string | null;
}

export interface AttendanceReportItem {
  user_id: string;
  email: string;
  status: AttendanceStatus;
  reason: string | null;
  timestamp?: Timestamp | null;
}

interface UserSummary {
  uid: string;
  email: string;
  role: string;
}

export function isDeadlinePassed(deadline: string | Timestamp | Date | null | undefined) {
  if (!deadline) {
    return false;
  }

  const deadlineDate =
    deadline instanceof Timestamp
      ? deadline.toDate()
      : deadline instanceof Date
        ? deadline
        : new Date(deadline);

  return !Number.isNaN(deadlineDate.getTime()) && deadlineDate.getTime() < Date.now();
}

export async function createAttendanceSession(data: AttendanceSessionInput) {
  const title = data.title.trim();
  const courseId = data.course_id.trim() || DEFAULT_COURSE_ID;

  if (!title) {
    throw new Error('Judul absensi wajib diisi.');
  }

  if (!data.date || !data.deadline) {
    throw new Error('Tanggal dan deadline absensi wajib diisi.');
  }

  if (new Date(data.deadline).getTime() < new Date(data.date).getTime()) {
    throw new Error('Deadline tidak boleh lebih awal dari tanggal absensi.');
  }

  const docRef = await addDoc(collection(db, 'attendance_sessions'), {
    course_id: courseId,
    title,
    date: data.date,
    deadline: data.deadline,
    created_by: data.created_by,
    created_at: serverTimestamp(),
  });

  return docRef.id;
}

export async function getAttendanceSessions(courseId: string) {
  await reconcileCourseAbsences(courseId);

  const sessionQuery = query(
    collection(db, 'attendance_sessions'),
    where('course_id', '==', courseId || DEFAULT_COURSE_ID),
  );
  const snapshot = await getDocs(sessionQuery);

  return snapshot.docs
    .map((sessionDoc) => ({
      id: sessionDoc.id,
      ...(sessionDoc.data() as Omit<AttendanceSession, 'id'>),
    }))
    .sort((left, right) => right.date.localeCompare(left.date));
}

export async function submitAttendance(
  sessionId: string,
  userId: string,
  status: AttendanceStatus,
  reason?: string,
) {
  const sessionRef = doc(db, 'attendance_sessions', sessionId);
  const sessionSnap = await getDoc(sessionRef);

  if (!sessionSnap.exists()) {
    throw new Error('Sesi absensi tidak ditemukan.');
  }

  const session = sessionSnap.data() as AttendanceSession;
  if (isDeadlinePassed(session.deadline)) {
    throw new Error('Absensi sudah melewati deadline.');
  }

  if (status === 'izin' && !reason?.trim()) {
    throw new Error('Alasan wajib diisi untuk status izin.');
  }

  const attendanceId = buildAttendanceId(sessionId, userId);
  const attendanceRef = doc(db, 'attendances', attendanceId);
  const attendanceSnap = await getDoc(attendanceRef);

  if (attendanceSnap.exists()) {
    throw new Error('Anda sudah mengisi absensi untuk sesi ini.');
  }

  const userSnap = await getDoc(doc(db, 'users', userId));
  const userEmail = userSnap.exists() ? ((userSnap.data() as UserSummary).email ?? null) : null;

  await setDoc(attendanceRef, {
    session_id: sessionId,
    user_id: userId,
    user_email: userEmail,
    status,
    reason: status === 'izin' ? reason?.trim() ?? null : null,
    timestamp: serverTimestamp(),
  });
}

export async function getStudentAttendanceHistory(courseId: string, userId: string) {
  const sessions = await getAttendanceSessions(courseId);
  await reconcileStudentAbsences(sessions, userId);

  const attendanceQuery = query(collection(db, 'attendances'), where('user_id', '==', userId));
  const attendanceSnapshot = await getDocs(attendanceQuery);
  const attendanceBySession = new Map<string, AttendanceRecord>();

  attendanceSnapshot.docs.forEach((attendanceDoc) => {
    const attendance = attendanceDoc.data() as Omit<AttendanceRecord, 'id'>;
    attendanceBySession.set(attendance.session_id, {
      id: attendanceDoc.id,
      ...attendance,
    });
  });

  return sessions.map((session) => ({
    session,
    attendance: attendanceBySession.get(session.id) ?? null,
  }));
}

export async function getAttendanceSessionReport(sessionId: string) {
  const sessionSnap = await getDoc(doc(db, 'attendance_sessions', sessionId));
  if (!sessionSnap.exists()) {
    throw new Error('Sesi absensi tidak ditemukan.');
  }

  const session = {
    id: sessionSnap.id,
    ...(sessionSnap.data() as Omit<AttendanceSession, 'id'>),
  };

  const students = await getStudents();
  await reconcileSessionAbsences(session, students);

  const attendanceQuery = query(collection(db, 'attendances'), where('session_id', '==', sessionId));
  const attendanceSnapshot = await getDocs(attendanceQuery);
  const attendanceByUser = new Map<string, AttendanceRecord>();

  attendanceSnapshot.docs.forEach((attendanceDoc) => {
    const attendance = attendanceDoc.data() as Omit<AttendanceRecord, 'id'>;
    attendanceByUser.set(attendance.user_id, {
      id: attendanceDoc.id,
      ...attendance,
    });
  });

  return students.map((student) => {
    const attendance = attendanceByUser.get(student.uid);

    return {
      user_id: student.uid,
      email: student.email,
      status: attendance?.status ?? 'tidak_hadir',
      reason: attendance?.reason ?? null,
      timestamp: attendance?.timestamp,
    } satisfies AttendanceReportItem;
  });
}

function buildAttendanceId(sessionId: string, userId: string) {
  return `${sessionId}_${userId}`;
}

async function getStudents() {
  const userQuery = query(collection(db, 'users'), where('role', '==', 'mahasiswa'));
  const snapshot = await getDocs(userQuery);

  return snapshot.docs.map((userDoc) => {
    const data = userDoc.data() as UserSummary;
    return {
      uid: userDoc.id,
      email: data.email ?? 'Tanpa email',
      role: data.role,
    };
  });
}

async function reconcileCourseAbsences(courseId: string) {
  const sessionQuery = query(
    collection(db, 'attendance_sessions'),
    where('course_id', '==', courseId || DEFAULT_COURSE_ID),
  );
  const sessionSnapshot = await getDocs(sessionQuery);
  const sessions = sessionSnapshot.docs.map((sessionDoc) => ({
    id: sessionDoc.id,
    ...(sessionDoc.data() as Omit<AttendanceSession, 'id'>),
  }));

  if (sessions.length === 0) {
    return;
  }

  const students = await getStudents();
  for (const session of sessions) {
    await reconcileSessionAbsences(session, students);
  }
}

async function reconcileStudentAbsences(sessions: AttendanceSession[], userId: string) {
  const overdueSessions = sessions.filter((session) => isDeadlinePassed(session.deadline));

  if (overdueSessions.length === 0) {
    return;
  }

  const batch = writeBatch(db);
  let hasWrite = false;

  const existingQuery = query(collection(db, 'attendances'), where('user_id', '==', userId));
  const existingSnapshot = await getDocs(existingQuery);
  const existingSessionIds = new Set(
    existingSnapshot.docs.map((attendanceDoc) => (attendanceDoc.data() as AttendanceRecord).session_id),
  );

  for (const session of overdueSessions) {
    if (existingSessionIds.has(session.id)) {
      continue;
    }

    hasWrite = true;
    batch.set(doc(db, 'attendances', buildAttendanceId(session.id, userId)), {
      session_id: session.id,
      user_id: userId,
      user_email: null,
      status: 'tidak_hadir',
      reason: null,
      timestamp: serverTimestamp(),
    });
  }

  if (hasWrite) {
    await batch.commit();
  }
}

async function reconcileSessionAbsences(session: AttendanceSession, students: UserSummary[]) {
  if (!isDeadlinePassed(session.deadline) || students.length === 0) {
    return;
  }

  const attendanceQuery = query(collection(db, 'attendances'), where('session_id', '==', session.id));
  const attendanceSnapshot = await getDocs(attendanceQuery);
  const existingUserIds = new Set(
    attendanceSnapshot.docs.map((attendanceDoc) => (attendanceDoc.data() as AttendanceRecord).user_id),
  );

  const batch = writeBatch(db);
  let hasWrite = false;

  for (const student of students) {
    if (existingUserIds.has(student.uid)) {
      continue;
    }

    hasWrite = true;
    batch.set(doc(db, 'attendances', buildAttendanceId(session.id, student.uid)), {
      session_id: session.id,
      user_id: student.uid,
      user_email: student.email,
      status: 'tidak_hadir',
      reason: null,
      timestamp: serverTimestamp(),
    });
  }

  if (hasWrite) {
    await batch.commit();
  }
}
