import { existsSync } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '../../../../lib/admin-auth';
import { getUserProfile, updateUserPhoto } from '../../../../lib/profile-service';

const PROFILE_UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'profiles');
const PROFILE_UPLOAD_PREFIX = '/uploads/profiles/';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.-]/g, '_');
}

function resolveLocalProfilePath(photoURL?: string): string | null {
  if (!photoURL || !photoURL.startsWith(PROFILE_UPLOAD_PREFIX)) {
    return null;
  }

  const filename = photoURL.slice(PROFILE_UPLOAD_PREFIX.length);
  if (!filename || filename.includes('/') || filename.includes('\\')) {
    return null;
  }

  return join(PROFILE_UPLOAD_DIR, filename);
}

async function deleteOldProfilePhoto(photoURL?: string): Promise<void> {
  const localPath = resolveLocalProfilePath(photoURL);
  if (!localPath || !existsSync(localPath)) {
    return;
  }

  await unlink(localPath);
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File foto profil tidak ditemukan.' }, { status: 400 });
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Format foto harus JPG, PNG, WEBP, atau GIF.' }, { status: 400 });
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: 'Ukuran foto maksimal 5MB.' }, { status: 400 });
    }

    if (!existsSync(PROFILE_UPLOAD_DIR)) {
      await mkdir(PROFILE_UPLOAD_DIR, { recursive: true });
    }

    const currentProfile = await getUserProfile(actor.uid);
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).slice(2, 10);
    const filename = `${actor.uid}_${timestamp}_${randomStr}_${sanitizeFileName(file.name)}`;
    const filePath = join(PROFILE_UPLOAD_DIR, filename);

    const buffer = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(buffer));

    const profile = await updateUserPhoto(actor.uid, `${PROFILE_UPLOAD_PREFIX}${filename}`);
    await deleteOldProfilePhoto(currentProfile.photoURL);

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal mengunggah foto profil.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const currentProfile = await getUserProfile(actor.uid);
    const profile = await updateUserPhoto(actor.uid, null);
    await deleteOldProfilePhoto(currentProfile.photoURL);

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal menghapus foto profil.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
