import { auth } from './firebase';

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
  created_at?: string | null;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  user_id: string;
  status: AttendanceStatus;
  reason: string | null;
  timestamp?: string | null;
  user_email?: string | null;
}

export interface AttendanceReportItem {
  user_id: string;
  email: string;
  status: AttendanceStatus;
  reason: string | null;
  timestamp?: string | null;
}

async function getAuthHeaders() {
  if (!auth.currentUser) {
    throw new Error('Sesi login belum aktif. Silakan login ulang.');
  }

  const token = await auth.currentUser.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function parseJsonResponse(response: Response) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data && typeof data.error === 'string' && data.error.trim()
        ? data.error
        : 'Terjadi kesalahan saat memproses absensi.';
    throw new Error(message);
  }

  return data;
}

export function isDeadlinePassed(deadline: string | Date | null | undefined) {
  if (!deadline) {
    return false;
  }

  const deadlineDate = deadline instanceof Date ? deadline : new Date(deadline);
  return !Number.isNaN(deadlineDate.getTime()) && deadlineDate.getTime() < Date.now();
}

export async function createAttendanceSession(data: AttendanceSessionInput) {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/attendance/sessions', {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  const payload = await parseJsonResponse(response);
  return typeof payload?.id === 'string' ? payload.id : '';
}

export async function getAttendanceSessions(courseId: string) {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({ courseId: courseId || DEFAULT_COURSE_ID });
  const response = await fetch(`/api/attendance/sessions?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: headers.Authorization,
    },
  });
  const payload = await parseJsonResponse(response);
  return Array.isArray(payload?.sessions) ? payload.sessions as AttendanceSession[] : [];
}

export async function submitAttendance(
  sessionId: string,
  userId: string,
  status: AttendanceStatus,
  reason?: string,
) {
  const headers = await getAuthHeaders();
  const response = await fetch('/api/attendance/submit', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      sessionId,
      userId,
      status,
      reason: reason ?? '',
    }),
  });
  await parseJsonResponse(response);
}

export async function getStudentAttendanceHistory(courseId: string, userId: string) {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({
    courseId: courseId || DEFAULT_COURSE_ID,
    userId,
  });
  const response = await fetch(`/api/attendance/history?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: headers.Authorization,
    },
  });
  const payload = await parseJsonResponse(response);
  return Array.isArray(payload?.history)
    ? payload.history as Array<{ session: AttendanceSession; attendance: AttendanceRecord | null }>
    : [];
}

export async function getAttendanceSessionReport(sessionId: string) {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({ sessionId });
  const response = await fetch(`/api/attendance/report?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: headers.Authorization,
    },
  });
  const payload = await parseJsonResponse(response);
  return Array.isArray(payload?.report) ? payload.report as AttendanceReportItem[] : [];
}
