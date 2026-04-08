import { NextRequest } from 'next/server';
import { readFromFirestore, verifyFirebaseIdToken } from './firebase-admin';
import type { AdminUser } from './admin-service';

function extractBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}

export async function requireAdminUser(request: NextRequest): Promise<AdminUser> {
  const token = extractBearerToken(request);
  if (!token) {
    throw new Error('Token autentikasi admin tidak ditemukan.');
  }

  const authUser = await verifyFirebaseIdToken(token);
  const user = await readFromFirestore<AdminUser>(`users/${authUser.uid}`);

  if (!user || user.role !== 'admin') {
    throw new Error('Akses admin ditolak.');
  }

  return {
    ...user,
    uid: authUser.uid,
    email: authUser.email ?? user.email ?? null,
  };
}

export async function requireAuthenticatedUser(request: NextRequest): Promise<Pick<AdminUser, 'uid' | 'email'>> {
  const token = extractBearerToken(request);
  if (!token) {
    throw new Error('Token autentikasi tidak ditemukan.');
  }

  const authUser = await verifyFirebaseIdToken(token);
  return {
    uid: authUser.uid,
    email: authUser.email,
  };
}

export async function requireTeacherUser(request: NextRequest): Promise<AdminUser> {
  const token = extractBearerToken(request);
  if (!token) {
    throw new Error('Token autentikasi tidak ditemukan.');
  }

  const authUser = await verifyFirebaseIdToken(token);
  const user = await readFromFirestore<AdminUser>(`users/${authUser.uid}`);

  if (!user || (user.role !== 'admin' && user.role !== 'dosen')) {
    throw new Error('Akses dosen/admin ditolak.');
  }

  return {
    ...user,
    uid: authUser.uid,
    email: authUser.email ?? user.email ?? null,
  };
}
