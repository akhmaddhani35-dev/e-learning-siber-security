import { NextRequest, NextResponse } from 'next/server';
import { readFromFirestore, verifyFirebaseIdToken, writeToFirestore } from '../../../lib/firebase-admin';

type Role = 'admin' | 'dosen' | 'mahasiswa';

interface UserRecord {
  uid: string;
  email: string | null;
  role: Role;
}

interface QuizQuestionPayload {
  question?: unknown;
  options?: unknown;
  correctAnswer?: unknown;
}

function extractBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: 'Token autentikasi tidak ditemukan.' }, { status: 401 });
    }

    const authUser = await verifyFirebaseIdToken(token);
    const user = await readFromFirestore<UserRecord>(`users/${authUser.uid}`);

    if (!user) {
      return NextResponse.json({ error: 'Data pengguna tidak ditemukan di Firestore.' }, { status: 403 });
    }

    if (user.role !== 'admin' && user.role !== 'dosen') {
      return NextResponse.json({ error: `Role ${user.role} tidak berwenang menambah quiz.` }, { status: 403 });
    }

    const body = (await request.json()) as QuizQuestionPayload;
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    const options = Array.isArray(body.options)
      ? body.options.map((item) => (typeof item === 'string' ? item.trim() : ''))
      : [];
    const correctAnswer = typeof body.correctAnswer === 'string' ? body.correctAnswer.trim() : '';

    if (!question || options.length !== 4 || options.some((item) => !item) || !correctAnswer) {
      return NextResponse.json({ error: 'Pertanyaan, 4 opsi, dan jawaban benar wajib diisi.' }, { status: 400 });
    }

    if (!options.includes(correctAnswer)) {
      return NextResponse.json({ error: 'Jawaban benar harus salah satu dari opsi yang tersedia.' }, { status: 400 });
    }

    const questionId = crypto.randomUUID();
    await writeToFirestore('quizQuestions', questionId, {
      question,
      options,
      correctAnswer,
      authorUid: authUser.uid,
      authorEmail: authUser.email,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, id: questionId });
  } catch (error) {
    console.error('Error creating quiz question:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal menambahkan soal quiz.' },
      { status: 500 }
    );
  }
}
