import {
  adminUpdateFirebaseUser,
  createFirebaseUser,
  deleteFromFirestore,
  listFirestoreCollection,
  patchFirestoreDocument,
  readFromFirestore,
  writeToFirestore,
} from './firebase-admin';
import { hashPassword } from './password';

export type UserRole = 'admin' | 'dosen' | 'mahasiswa';

export interface AdminUser {
  uid: string;
  username?: string;
  email: string | null;
  role: UserRole;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface AdminCourse {
  id: string;
  title: string;
  description?: string;
  category?: string;
  content?: string;
  authorUid?: string;
  authorEmail?: string | null;
  createdAt?: string;
  approved?: boolean;
  approvedAt?: string;
  approvedBy?: string;
  filePath?: string;
  fileName?: string;
  deadline?: string;
  assignmentEnabled?: boolean;
}

export interface DashboardSummary {
  totalUsers: number;
  totalCourses: number;
  totalActiveStudents: number;
}

export interface SystemLogEntry {
  id: string;
  action: string;
  actorUid: string;
  actorEmail: string | null;
  actorRole?: UserRole;
  adminUid?: string;
  adminEmail?: string | null;
  targetId?: string;
  targetType?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface AdminQuizResult {
  id: string;
  userUid: string;
  userEmail: string;
  score: number;
  total: number;
  attemptedAt?: string;
}

interface StoredDocument {
  [key: string]: unknown;
}

interface LogContext {
  adminUid?: string;
  adminEmail?: string | null;
  targetId?: string;
  targetType?: string;
  metadata?: Record<string, unknown>;
}

function normalizeDateValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (value && typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000).toISOString();
  }

  return undefined;
}

function toAdminUser(entry: StoredDocument): AdminUser | null {
  if (typeof entry.uid !== 'string' || typeof entry.role !== 'string') {
    return null;
  }

  return {
    uid: entry.uid,
    username: typeof entry.username === 'string' ? entry.username : undefined,
    email: typeof entry.email === 'string' ? entry.email : null,
    role: entry.role as UserRole,
    createdAt: normalizeDateValue(entry.createdAt),
    lastLoginAt: normalizeDateValue(entry.lastLoginAt),
  };
}

function toAdminCourse(entry: StoredDocument): AdminCourse | null {
  if (typeof entry.title !== 'string') {
    return null;
  }

  const id =
    typeof entry.id === 'string'
      ? entry.id
      : typeof entry.uid === 'string'
        ? entry.uid
        : '';

  if (!id) {
    return null;
  }

  return {
    id,
    title: entry.title,
    description: typeof entry.description === 'string' ? entry.description : undefined,
    category: typeof entry.category === 'string' ? entry.category : undefined,
    content: typeof entry.content === 'string' ? entry.content : undefined,
    authorUid: typeof entry.authorUid === 'string' ? entry.authorUid : undefined,
    authorEmail: typeof entry.authorEmail === 'string' ? entry.authorEmail : null,
    createdAt: normalizeDateValue(entry.createdAt),
    approved: typeof entry.approved === 'boolean' ? entry.approved : true,
    approvedAt: normalizeDateValue(entry.approvedAt),
    approvedBy: typeof entry.approvedBy === 'string' ? entry.approvedBy : undefined,
    filePath: typeof entry.filePath === 'string' ? entry.filePath : undefined,
    fileName: typeof entry.fileName === 'string' ? entry.fileName : undefined,
    deadline: normalizeDateValue(entry.deadline),
    assignmentEnabled: typeof entry.assignmentEnabled === 'boolean' ? entry.assignmentEnabled : true,
  };
}

async function writeSystemLog(
  action: string,
  actorUid: string,
  actorEmail: string | null,
  context: LogContext & { actorRole?: UserRole } = {}
): Promise<void> {
  const logId = crypto.randomUUID();
  await writeToFirestore('systemLogs', logId, {
    id: logId,
    action,
    actorUid,
    actorEmail,
    actorRole: context.actorRole ?? null,
    adminUid: context.adminUid ?? actorUid,
    adminEmail: context.adminEmail ?? actorEmail,
    targetId: context.targetId ?? '',
    targetType: context.targetType ?? '',
    metadata: context.metadata ?? {},
    createdAt: new Date().toISOString(),
  });
}

function toSystemLogEntry(entry: StoredDocument): SystemLogEntry | null {
  if (typeof entry.id !== 'string' || typeof entry.action !== 'string' || typeof entry.actorUid !== 'string') {
    return null;
  }

  return {
    id: entry.id,
    action: entry.action,
    actorUid: entry.actorUid,
    actorEmail: typeof entry.actorEmail === 'string' ? entry.actorEmail : null,
    actorRole: typeof entry.actorRole === 'string' ? entry.actorRole as UserRole : undefined,
    adminUid: typeof entry.adminUid === 'string' ? entry.adminUid : undefined,
    adminEmail: typeof entry.adminEmail === 'string' ? entry.adminEmail : null,
    targetId: typeof entry.targetId === 'string' ? entry.targetId : undefined,
    targetType: typeof entry.targetType === 'string' ? entry.targetType : undefined,
    metadata: typeof entry.metadata === 'object' && entry.metadata !== null ? entry.metadata as Record<string, unknown> : undefined,
    createdAt: normalizeDateValue(entry.createdAt),
  };
}

function toAdminQuizResult(entry: StoredDocument): AdminQuizResult | null {
  if (typeof entry.id !== 'string' || typeof entry.userUid !== 'string') {
    return null;
  }

  return {
    id: entry.id,
    userUid: entry.userUid,
    userEmail: typeof entry.userEmail === 'string' ? entry.userEmail : '',
    score: typeof entry.score === 'number' ? entry.score : 0,
    total: typeof entry.total === 'number' ? entry.total : 0,
    attemptedAt: normalizeDateValue(entry.attemptedAt),
  };
}

export async function getAllUsers(): Promise<AdminUser[]> {
  const rows = await listFirestoreCollection<StoredDocument>('users');
  return rows
    .map((entry) => toAdminUser(entry))
    .filter((entry): entry is AdminUser => entry !== null)
    .sort((left, right) => (left.email ?? '').localeCompare(right.email ?? ''));
}

export async function createUser(
  input: {
    email: string;
    password: string;
    role: UserRole;
    username?: string;
  },
  adminUser: Pick<AdminUser, 'uid' | 'email'>
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const role = input.role;
  const username = (input.username?.trim() || email.split('@')[0] || 'user').trim();

  if (!email) {
    throw new Error('Email wajib diisi.');
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    throw new Error('Format email tidak valid.');
  }

  if (password.length < 6) {
    throw new Error('Password minimal 6 karakter.');
  }

  if (!username) {
    throw new Error('Username wajib diisi.');
  }

  const firebaseUser = await createFirebaseUser(email, password);
  const passwordHash = await hashPassword(password);

  await writeToFirestore('users', firebaseUser.uid, {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? email,
    username,
    role,
    createdAt: new Date().toISOString(),
    passwordHash,
  });

  await writeSystemLog('admin.create_user', adminUser.uid, adminUser.email, {
    targetId: firebaseUser.uid,
    targetType: 'user',
    metadata: {
      email,
      role,
      username,
    },
  });
}

export async function deleteUser(
  id: string,
  adminUser: Pick<AdminUser, 'uid' | 'email'>
): Promise<void> {
  const existingUser = await readFromFirestore<AdminUser>(`users/${id}`);
  await deleteFromFirestore(`users/${id}`);
  await writeSystemLog('admin.delete_user', adminUser.uid, adminUser.email, {
    targetId: id,
    targetType: 'user',
    metadata: {
      deletedEmail: existingUser?.email ?? null,
    },
  });
}

export async function updateUserRole(
  id: string,
  role: UserRole,
  adminUser: Pick<AdminUser, 'uid' | 'email'>
): Promise<void> {
  const existingUser = await readFromFirestore<AdminUser>(`users/${id}`);
  if (!existingUser) {
    throw new Error('User tidak ditemukan.');
  }

  await patchFirestoreDocument(
    `users/${id}`,
    {
      role,
      updatedAt: new Date().toISOString(),
    },
    ['role', 'updatedAt']
  );

  await writeSystemLog('admin.update_user_role', adminUser.uid, adminUser.email, {
    targetId: id,
    targetType: 'user',
    metadata: {
      role,
    },
  });
}

export async function resetUserPassword(
  id: string,
  newPassword: string,
  adminUser: Pick<AdminUser, 'uid' | 'email'>
): Promise<void> {
  const existingUser = await readFromFirestore<AdminUser>(`users/${id}`);
  if (!existingUser) {
    throw new Error('User tidak ditemukan.');
  }

  if (newPassword.length < 6) {
    throw new Error('Password baru minimal 6 karakter.');
  }

  await adminUpdateFirebaseUser(id, { password: newPassword });
  const passwordHash = await hashPassword(newPassword);

  await patchFirestoreDocument(
    `users/${id}`,
    {
      passwordHash,
      passwordUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    ['passwordHash', 'passwordUpdatedAt', 'updatedAt']
  );

  await writeSystemLog('admin.reset_user_password', adminUser.uid, adminUser.email, {
    targetId: id,
    targetType: 'user',
    metadata: {
      email: existingUser.email ?? null,
    },
  });
}

export async function getAllCourses(): Promise<AdminCourse[]> {
  const rows = await listFirestoreCollection<StoredDocument>('materials');
  return rows
    .map((entry) => toAdminCourse(entry))
    .filter((entry): entry is AdminCourse => entry !== null)
    .sort((left, right) => (right.createdAt ?? '').localeCompare(left.createdAt ?? ''));
}

export async function approveCourse(
  id: string,
  adminUser: Pick<AdminUser, 'uid' | 'email'>
): Promise<void> {
  const existingCourse = await readFromFirestore<AdminCourse>(`materials/${id}`);
  if (!existingCourse) {
    throw new Error('Course tidak ditemukan.');
  }

  await patchFirestoreDocument(
    `materials/${id}`,
    {
      approved: true,
      approvedAt: new Date().toISOString(),
      approvedBy: adminUser.uid,
    },
    ['approved', 'approvedAt', 'approvedBy']
  );

  await writeSystemLog('admin.approve_course', adminUser.uid, adminUser.email, {
    targetId: id,
    targetType: 'course',
  });
}

export async function deleteCourse(
  id: string,
  adminUser: Pick<AdminUser, 'uid' | 'email'>
): Promise<void> {
  const existingCourse = await readFromFirestore<AdminCourse>(`materials/${id}`);
  await deleteFromFirestore(`materials/${id}`);
  await writeSystemLog('admin.delete_course', adminUser.uid, adminUser.email, {
    targetId: id,
    targetType: 'course',
    metadata: {
      title: existingCourse?.title ?? '',
    },
  });
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [users, courses] = await Promise.all([getAllUsers(), getAllCourses()]);

  return {
    totalUsers: users.length,
    totalCourses: courses.length,
    totalActiveStudents: users.filter((user) => user.role === 'mahasiswa').length,
  };
}

export async function logUserLogin(user: Pick<AdminUser, 'uid' | 'email'>): Promise<void> {
  const currentUser = await readFromFirestore<AdminUser>(`users/${user.uid}`);
  await patchFirestoreDocument(
    `users/${user.uid}`,
    {
      lastLoginAt: new Date().toISOString(),
    },
    ['lastLoginAt']
  );

  await writeSystemLog('auth.login', user.uid, user.email, {
    actorRole: currentUser?.role,
    targetId: user.uid,
    targetType: 'user',
  });
}

export async function logRoleActivity(
  user: Pick<AdminUser, 'uid' | 'email'>,
  action: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const currentUser = await readFromFirestore<AdminUser>(`users/${user.uid}`);
  await writeSystemLog(action, user.uid, user.email, {
    actorRole: currentUser?.role,
    targetId: user.uid,
    targetType: 'user',
    metadata,
  });
}

export async function getRoleActivityLogs(): Promise<SystemLogEntry[]> {
  const rows = await listFirestoreCollection<StoredDocument>('systemLogs');
  return rows
    .map((entry) => toSystemLogEntry(entry))
    .filter((entry): entry is SystemLogEntry => entry !== null)
    .filter((entry) => entry.actorRole === 'mahasiswa' || entry.actorRole === 'dosen')
    .sort((left, right) => (right.createdAt ?? '').localeCompare(left.createdAt ?? ''));
}

export async function getAllQuizResults(): Promise<AdminQuizResult[]> {
  const rows = await listFirestoreCollection<StoredDocument>('quizResults');
  return rows
    .map((entry) => toAdminQuizResult(entry))
    .filter((entry): entry is AdminQuizResult => entry !== null)
    .sort((left, right) => (right.attemptedAt ?? '').localeCompare(left.attemptedAt ?? ''));
}

export async function deleteQuizResult(
  id: string,
  actor: Pick<AdminUser, 'uid' | 'email' | 'role'>
): Promise<void> {
  const existingResult = await readFromFirestore<AdminQuizResult>(`quizResults/${id}`);
  if (!existingResult) {
    throw new Error('Riwayat quiz tidak ditemukan.');
  }

  await deleteFromFirestore(`quizResults/${id}`);
  await writeSystemLog('admin.delete_quiz_result', actor.uid, actor.email, {
    actorRole: actor.role,
    adminUid: actor.uid,
    adminEmail: actor.email,
    targetId: id,
    targetType: 'quizResult',
    metadata: {
      userUid: existingResult.userUid,
      userEmail: existingResult.userEmail,
      score: existingResult.score,
      total: existingResult.total,
    },
  });
}
