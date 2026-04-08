import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '../../../lib/admin-auth';
import { isDeadlinePassed } from '../../../lib/deadline';
import { listFirestoreCollection, readFromFirestore, writeToFirestore } from '../../../lib/firebase-admin';

type Role = 'admin' | 'dosen' | 'mahasiswa';

interface UserRecord {
  uid: string;
  email: string | null;
  role: Role;
}

interface AssignmentSubmissionRecord {
  id: string;
  materialId: string;
  materialTitle: string;
  userUid: string;
  userEmail: string;
  username?: string;
  photoURL?: string;
  filePath: string;
  fileName: string;
  createdAt: string;
}

interface MaterialRecord {
  id?: string;
  title?: string;
  deadline?: string;
  assignmentEnabled?: boolean;
}

interface SubmissionUserProfile {
  uid: string;
  email?: string | null;
  username?: string;
  photoURL?: string | null;
}

async function requireStudentUser(request: NextRequest): Promise<Pick<UserRecord, 'uid' | 'email'>> {
  const actor = await requireAuthenticatedUser(request);
  const user = await readFromFirestore<UserRecord>(`users/${actor.uid}`);

  if (!user || user.role !== 'mahasiswa') {
    throw new Error('Hanya mahasiswa yang dapat mengirim tugas.');
  }

  return actor;
}

async function requireSubmissionViewer(request: NextRequest): Promise<UserRecord> {
  const actor = await requireAuthenticatedUser(request);
  const user = await readFromFirestore<UserRecord>(`users/${actor.uid}`);

  if (!user) {
    throw new Error('Data pengguna tidak ditemukan.');
  }

  return {
    ...user,
    uid: actor.uid,
    email: actor.email ?? user.email,
  };
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireSubmissionViewer(request);
    const submissions = await listFirestoreCollection<AssignmentSubmissionRecord>('assignmentSubmissions');
    const visibleSubmissions = actor.role === 'mahasiswa'
      ? submissions.filter((item) => item.userUid === actor.uid)
      : submissions;
    const enrichedSubmissions = await Promise.all(
      visibleSubmissions.map(async (submission) => {
        const userProfile = await readFromFirestore<SubmissionUserProfile>(`users/${submission.userUid}`);
        return {
          ...submission,
          username:
            userProfile?.username?.trim() ||
            submission.userEmail.split('@')[0] ||
            'user',
          photoURL: typeof userProfile?.photoURL === 'string' ? userProfile.photoURL : undefined,
        };
      })
    );
    const sortedSubmissions = enrichedSubmissions.sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return NextResponse.json({ submissions: sortedSubmissions });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal memuat pengumpulan tugas.';
    const status = message.includes('tidak ditemukan') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireStudentUser(request);
    const formData = await request.formData();
    const file = formData.get('file');
    const materialId = formData.get('materialId');
    const materialTitle = formData.get('materialTitle');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File tugas wajib diunggah.' }, { status: 400 });
    }

    if (typeof materialId !== 'string' || !materialId.trim() || typeof materialTitle !== 'string' || !materialTitle.trim()) {
      return NextResponse.json({ error: 'Material tugas tidak valid.' }, { status: 400 });
    }

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'Ukuran file melebihi batas maksimal 50MB.' }, { status: 400 });
    }

    const normalizedMaterialId = materialId.trim();
    const normalizedMaterialTitle = materialTitle.trim();
    const material = await readFromFirestore<MaterialRecord>(`materials/${normalizedMaterialId}`);
    if (!material) {
      return NextResponse.json({ error: 'Materi tugas tidak ditemukan.' }, { status: 404 });
    }

    if (material.assignmentEnabled === false) {
      return NextResponse.json({ error: 'Materi ini tidak memerlukan upload tugas.' }, { status: 400 });
    }

    if (isDeadlinePassed(material.deadline)) {
      return NextResponse.json({ error: 'Deadline tugas sudah lewat. Pengumpulan ditutup.' }, { status: 409 });
    }

    const submissionId = `${actor.uid}_${normalizedMaterialId}`;
    const existingSubmission = await readFromFirestore<AssignmentSubmissionRecord>(`assignmentSubmissions/${submissionId}`);

    if (existingSubmission) {
      return NextResponse.json({ error: 'Tugas untuk materi ini sudah pernah dikirim dan tidak bisa dikirim ulang.' }, { status: 409 });
    }

    const uploadDir = join(process.cwd(), 'public', 'uploads', 'tugas');
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const originalName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${timestamp}_${randomStr}_${originalName}`;
    const filepath = join(uploadDir, filename);
    const buffer = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(buffer));

    const relativePath = `/uploads/tugas/${filename}`;
    const createdAt = new Date().toISOString();

    await writeToFirestore('assignmentSubmissions', submissionId, {
      id: submissionId,
      materialId: normalizedMaterialId,
      materialTitle: normalizedMaterialTitle,
      userUid: actor.uid,
      userEmail: actor.email ?? '',
      username: actor.email?.split('@')[0] ?? 'user',
      filePath: relativePath,
      fileName: file.name,
      createdAt,
    });

    return NextResponse.json({
      success: true,
      submission: {
        id: submissionId,
        materialId: normalizedMaterialId,
        materialTitle: normalizedMaterialTitle,
        userUid: actor.uid,
        userEmail: actor.email ?? '',
        username: actor.email?.split('@')[0] ?? 'user',
        filePath: relativePath,
        fileName: file.name,
        createdAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal mengirim tugas.';
    const status = message.includes('mahasiswa') ? 403 : message.includes('sudah pernah') || message.includes('Deadline') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
