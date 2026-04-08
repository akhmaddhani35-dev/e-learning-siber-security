import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireTeacherUser } from '../../../lib/admin-auth';
import { isDeadlinePassed } from '../../../lib/deadline';
import { deleteQuizResult, getAllQuizResults } from '../../../lib/admin-service';
import { listFirestoreCollection, readFromFirestore, writeToFirestore } from '../../../lib/firebase-admin';

type Role = 'admin' | 'dosen' | 'mahasiswa';

interface UserRecord {
  uid: string;
  email: string | null;
  role: Role;
}

interface QuizQuestionRecord {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  deadline?: string;
}

interface QuizSubmitPayload {
  answers?: unknown;
}

export async function GET(request: NextRequest) {
  try {
    await requireTeacherUser(request);
    const results = await getAllQuizResults();
    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal memuat riwayat quiz.';
    const status = message.includes('ditolak') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const user = await readFromFirestore<UserRecord>(`users/${actor.uid}`);

    if (!user || user.role !== 'mahasiswa') {
      return NextResponse.json({ error: 'Hanya mahasiswa yang dapat mengerjakan quiz.' }, { status: 403 });
    }

    const body = (await request.json()) as QuizSubmitPayload;
    const answers =
      typeof body.answers === 'object' && body.answers !== null
        ? body.answers as Record<string, string>
        : null;

    if (!answers || Object.keys(answers).length === 0) {
      return NextResponse.json({ error: 'Jawaban quiz wajib diisi.' }, { status: 400 });
    }

    const existingResults = await listFirestoreCollection<{ userUid?: string }>('quizResults');
    if (existingResults.some((item) => item.userUid === actor.uid)) {
      return NextResponse.json({ error: 'Quiz ini sudah pernah Anda kerjakan dan tidak bisa diulang.' }, { status: 409 });
    }

    const questions = await listFirestoreCollection<QuizQuestionRecord>('quizQuestions');
    if (questions.length === 0) {
      return NextResponse.json({ error: 'Belum ada soal quiz.' }, { status: 400 });
    }

    const expiredQuestion = questions.find((question) => isDeadlinePassed(question.deadline));
    if (expiredQuestion) {
      return NextResponse.json({ error: 'Deadline quiz sudah lewat. Pengumpulan jawaban ditutup.' }, { status: 409 });
    }

    if (questions.some((question) => typeof answers[question.id] !== 'string' || !answers[question.id].trim())) {
      return NextResponse.json({ error: 'Jawab semua soal terlebih dahulu.' }, { status: 400 });
    }

    const score = questions.reduce((sum, question) => {
      return sum + (answers[question.id] === question.correctAnswer ? 1 : 0);
    }, 0);

    const resultId = crypto.randomUUID();
    const attemptedAt = new Date().toISOString();

    await writeToFirestore('quizResults', resultId, {
      id: resultId,
      userUid: actor.uid,
      userEmail: actor.email ?? user.email ?? '',
      score,
      total: questions.length,
      answers,
      attemptedAt,
    });

    return NextResponse.json({
      success: true,
      result: {
        id: resultId,
        score,
        total: questions.length,
        attemptedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal menyimpan hasil quiz.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const actor = await requireTeacherUser(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID riwayat quiz wajib diisi.' }, { status: 400 });
    }

    await deleteQuizResult(id, actor);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal menghapus riwayat quiz.';
    const status = message.includes('ditolak') ? 403 : message.includes('tidak ditemukan') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
