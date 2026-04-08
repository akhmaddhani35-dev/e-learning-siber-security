import { hashPassword } from './password';
import { patchFirestoreDocument, readFromFirestore, updateFirebaseAccount } from './firebase-admin';

export type UserRole = 'admin' | 'dosen' | 'mahasiswa';

export interface UserProfile {
  uid: string;
  username: string;
  email: string;
  role: UserRole;
  createdAt?: string;
  photoURL?: string;
}

interface StoredUserRecord {
  uid: string;
  username?: string;
  email?: string | null;
  role: UserRole;
  createdAt?: string | { seconds: number };
  photoURL?: string | null;
}

function normalizeDate(value: StoredUserRecord['createdAt']): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object' && 'seconds' in value && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000).toISOString();
  }

  return undefined;
}

function toUsername(record: StoredUserRecord): string {
  if (record.username && record.username.trim()) {
    return record.username;
  }

  const fallbackEmail = typeof record.email === 'string' ? record.email : '';
  return fallbackEmail.split('@')[0] || 'user';
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const record = await readFromFirestore<StoredUserRecord>(`users/${userId}`);
  if (!record || !record.uid || !record.email) {
    throw new Error('Profil pengguna tidak ditemukan.');
  }

  return {
    uid: record.uid,
    username: toUsername(record),
    email: record.email,
    role: record.role,
    createdAt: normalizeDate(record.createdAt),
    photoURL: typeof record.photoURL === 'string' && record.photoURL.trim() ? record.photoURL : undefined,
  };
}

export async function updateUserProfile(
  userId: string,
  data: {
    username: string;
    email: string;
  },
  currentIdToken: string
): Promise<UserProfile> {
  const username = data.username.trim();
  const email = data.email.trim().toLowerCase();

  if (!username) {
    throw new Error('Username wajib diisi.');
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    throw new Error('Format email tidak valid.');
  }

  const currentProfile = await getUserProfile(userId);
  let nextEmail = currentProfile.email;

  if (email !== currentProfile.email.toLowerCase()) {
    const updatedAccount = await updateFirebaseAccount(currentIdToken, { email });
    nextEmail = updatedAccount.email ?? email;
  }

  await patchFirestoreDocument(
    `users/${userId}`,
    {
      username,
      email: nextEmail,
      updatedAt: new Date().toISOString(),
    },
    ['username', 'email', 'updatedAt']
  );

  return getUserProfile(userId);
}

export async function changePassword(
  userId: string,
  _oldPassword: string,
  newPassword: string
): Promise<void> {
  if (newPassword.length < 6) {
    throw new Error('Password baru minimal 6 karakter.');
  }

  const passwordHash = await hashPassword(newPassword);
  await patchFirestoreDocument(
    `users/${userId}`,
    {
      passwordHash,
      passwordUpdatedAt: new Date().toISOString(),
    },
    ['passwordHash', 'passwordUpdatedAt']
  );
}

export async function updateUserPhoto(userId: string, photoURL: string | null): Promise<UserProfile> {
  const normalizedPhotoURL = typeof photoURL === 'string' ? photoURL.trim() : '';

  await patchFirestoreDocument(
    `users/${userId}`,
    {
      photoURL: normalizedPhotoURL || null,
      updatedAt: new Date().toISOString(),
    },
    ['photoURL', 'updatedAt']
  );

  return getUserProfile(userId);
}
