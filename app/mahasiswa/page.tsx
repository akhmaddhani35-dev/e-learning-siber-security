'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, addDoc, getDocs, Timestamp, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import {
  DEFAULT_COURSE_ID,
  getStudentAttendanceHistory,
  isDeadlinePassed,
  submitAttendance,
  type AttendanceRecord,
  type AttendanceSession,
} from '../../lib/attendance';

interface User {
  uid: string;
  email: string;
  role: string;
}

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
}

interface QuizResult {
  id: string;
  score: number;
  total: number;
  attemptedAt: {
    seconds: number;
  };
}

interface QuizQuestionRecord {
  question?: string;
  options?: string[];
  correctAnswer?: string;
}

interface QuizResultRecord {
  userUid?: string;
  score?: number;
  total?: number;
  attemptedAt?: {
    seconds: number;
  };
}

interface AttendanceHistoryItem {
  session: AttendanceSession;
  attendance: AttendanceRecord | null;
}

const COURSE_ID = DEFAULT_COURSE_ID;

export default function MahasiswaPage() {
  const [user, setUser] = useState<User | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<QuizResult[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceHistoryItem[]>([]);
  const [attendanceChoices, setAttendanceChoices] = useState<Record<string, 'hadir' | 'izin'>>({});
  const [attendanceReasons, setAttendanceReasons] = useState<Record<string, string>>({});
  const [attendanceStatus, setAttendanceStatus] = useState('');
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [attendanceSavingId, setAttendanceSavingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          localStorage.removeItem('user');
          router.push('/login');
          return;
        }

        const storedUser = localStorage.getItem('user');
        if (!storedUser) {
          router.push('/login');
          return;
        }

        const userData = JSON.parse(storedUser) as User;
        if (userData.uid !== firebaseUser.uid) {
          localStorage.removeItem('user');
          router.push('/login');
          return;
        }

        const userRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userRef);

        if (!userDoc.exists()) {
          router.push('/login');
          return;
        }

        const firestoreData = userDoc.data();
        if (firestoreData.role !== 'mahasiswa') {
          router.push('/login');
          return;
        }

        const verifiedUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email ?? userData.email,
          role: firestoreData.role,
        };
        setUser(verifiedUser);
        await loadQuestions();
        await loadResults(firebaseUser.uid);
        await loadAttendanceHistory(firebaseUser.uid);
      } catch (err) {
        console.error('Error verifying user:', err);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const logRoleActivity = async (action: string, metadata?: Record<string, unknown>) => {
    try {
      if (!auth.currentUser) {
        return;
      }

      const idToken = await auth.currentUser.getIdToken();
      await fetch('/api/system-logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action, metadata }),
      });
    } catch {
      // Logging tidak boleh memblokir flow mahasiswa.
    }
  };

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const snapshot = await getDocs(collection(db, 'quizQuestions'));
      const list: QuizQuestion[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as QuizQuestionRecord;
        return {
          id: docSnap.id,
          question: data.question || '',
          options: data.options || [],
          correctAnswer: data.correctAnswer || '',
        };
      });
      setQuestions(list);
    } catch (err) {
      console.error('loadQuestions error', err);
      setStatus('Gagal memuat kuis.');
    } finally {
      setLoading(false);
    }
  };

  const loadResults = async (uid: string) => {
    try {
      const snapshot = await getDocs(collection(db, 'quizResults'));
      const list: QuizResult[] = snapshot.docs
        .filter((docSnap) => {
          const data = docSnap.data() as QuizResultRecord;
          return data.userUid === uid;
        })
        .map((docSnap) => {
          const data = docSnap.data() as QuizResultRecord;
          return {
            id: docSnap.id,
            score: data.score || 0,
            total: data.total || 0,
            attemptedAt: data.attemptedAt || { seconds: 0 },
          };
        });
      setResults(list.sort((a, b) => b.attemptedAt.seconds - a.attemptedAt.seconds));
    } catch (err) {
      console.error('loadResults error', err);
    }
  };

  const loadAttendanceHistory = async (uid: string) => {
    try {
      setAttendanceLoading(true);
      const history = await getStudentAttendanceHistory(COURSE_ID, uid);
      setAttendanceHistory(history);
    } catch (err) {
      console.error('loadAttendanceHistory error', err);
      setAttendanceStatus('Gagal memuat riwayat absensi.');
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleAnswerChange = (questionId: string, answer: string) => {
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const handleSubmitQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (questions.length === 0) {
      setStatus('Tidak ada soal kuis untuk dijalankan.');
      return;
    }

    const total = questions.length;
    let score = 0;

    questions.forEach((question) => {
      if (selectedAnswers[question.id] === question.correctAnswer) {
        score += 1;
      }
    });

    try {
      setSaving(true);
      await addDoc(collection(db, 'quizResults'), {
        userUid: user.uid,
        userEmail: user.email,
        score,
        total,
        answers: selectedAnswers,
        attemptedAt: Timestamp.now(),
      });
      setStatus(`Quiz selesai! Skor Anda ${score} dari ${total}`);
      setSelectedAnswers({});
      await loadResults(user.uid);
      void logRoleActivity('mahasiswa.submit_quiz', {
        score,
        total,
      });
    } catch (err) {
      console.error('submitQuiz error', err);
      setStatus('Gagal menyimpan hasil kuis.');
    } finally {
      setSaving(false);
    }
  };

  const handleAttendanceChoiceChange = (sessionId: string, value: 'hadir' | 'izin') => {
    setAttendanceChoices((prev) => ({ ...prev, [sessionId]: value }));
    if (value === 'hadir') {
      setAttendanceReasons((prev) => ({ ...prev, [sessionId]: '' }));
    }
  };

  const handleAttendanceSubmit = async (sessionId: string) => {
    if (!user) return;

    const selectedStatus = attendanceChoices[sessionId] || 'hadir';
    const reason = attendanceReasons[sessionId] || '';

    try {
      setAttendanceSavingId(sessionId);
      await submitAttendance(sessionId, user.uid, selectedStatus, reason);
      setAttendanceStatus('Absensi berhasil dikirim.');
      await loadAttendanceHistory(user.uid);
    } catch (err) {
      console.error('handleAttendanceSubmit error', err);
      setAttendanceStatus(err instanceof Error ? err.message : 'Gagal mengirim absensi.');
    } finally {
      setAttendanceSavingId('');
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('user');
    await signOut(auth);
    router.push('/login');
  };

  const formatDate = (value: string) =>
    new Date(value).toLocaleString('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

  const getAttendanceLabel = (attendanceState?: string | null) => {
    if (attendanceState === 'hadir') return 'Hadir';
    if (attendanceState === 'izin') return 'Izin';
    return 'Tidak Hadir';
  };

  const getAttendanceBadgeClass = (attendanceState?: string | null) => {
    if (attendanceState === 'hadir') {
      return 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200';
    }
    if (attendanceState === 'izin') {
      return 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-200';
    }
    return 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200';
  };

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard Mahasiswa</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2">
              Halo, <strong>{user.email}</strong> — akses langsung pembelajaran dan evaluasi kuis Anda.
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
          >
            Logout
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 mb-8">
          <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Modul Materi</h2>
            <p className="text-gray-600 dark:text-gray-300">Baca materi cyber hygiene.</p>
          </div>
          <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Simulasi AI</h2>
            <p className="text-gray-600 dark:text-gray-300">Input teks email untuk dicek (Phishing/Aman) oleh AI.</p>
          </div>
          <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Kuis Latihan</h2>
            <p className="text-gray-600 dark:text-gray-300">Kerjakan soal latihan deteksi.</p>
          </div>
          <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Riwayat & Skor</h2>
            <p className="text-gray-600 dark:text-gray-300">Lihat nilai kuis dan daftar email yang pernah diuji.</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Absensi Pertemuan</h2>
          {attendanceStatus && (
            <div className="mb-6 rounded-xl bg-blue-50 dark:bg-blue-900/80 border border-blue-200 dark:border-blue-800 p-4 text-blue-900 dark:text-blue-100">
              {attendanceStatus}
            </div>
          )}
          {attendanceLoading ? (
            <p className="text-gray-600 dark:text-gray-300">Memuat sesi absensi...</p>
          ) : attendanceHistory.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-300">Belum ada sesi absensi yang tersedia.</p>
          ) : (
            <div className="space-y-4">
              {attendanceHistory.map(({ session, attendance }) => {
                const selectedChoice = attendanceChoices[session.id] || 'hadir';
                const deadlinePassed = isDeadlinePassed(session.deadline);
                const alreadySubmitted = Boolean(attendance);

                return (
                  <div key={session.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{session.title}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300">Tanggal: {formatDate(session.date)}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-300">Deadline: {formatDate(session.deadline)}</p>
                      </div>
                      <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${getAttendanceBadgeClass(attendance?.status)}`}>
                        {alreadySubmitted ? getAttendanceLabel(attendance?.status) : deadlinePassed ? 'Tidak Hadir' : 'Belum Absen'}
                      </span>
                    </div>

                    {alreadySubmitted ? (
                      <div className="rounded-2xl bg-gray-50 dark:bg-gray-900 p-4 border border-gray-200 dark:border-gray-700">
                        <p className="text-sm text-gray-700 dark:text-gray-200">
                          Status absensi Anda: <strong>{getAttendanceLabel(attendance?.status)}</strong>
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                          Alasan izin: {attendance?.reason || '-'}
                        </p>
                      </div>
                    ) : deadlinePassed ? (
                      <div className="rounded-2xl bg-red-50 dark:bg-red-900/20 p-4 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
                        Deadline sudah lewat. Status absensi tercatat sebagai tidak hadir.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Status Kehadiran</label>
                          <select
                            value={selectedChoice}
                            onChange={(e) => handleAttendanceChoiceChange(session.id, e.target.value as 'hadir' | 'izin')}
                            className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="hadir">Hadir</option>
                            <option value="izin">Izin</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Alasan Izin</label>
                          <textarea
                            value={attendanceReasons[session.id] || ''}
                            onChange={(e) => setAttendanceReasons((prev) => ({ ...prev, [session.id]: e.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                            rows={3}
                            disabled={selectedChoice !== 'izin'}
                            placeholder="Isi alasan jika memilih izin"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAttendanceSubmit(session.id)}
                          disabled={attendanceSavingId === session.id}
                          className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-200 disabled:opacity-60"
                        >
                          {attendanceSavingId === session.id ? 'Menyimpan...' : 'Kirim Absensi'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Kuis Latihan</h2>
          {status && (
            <div className="mb-6 rounded-xl bg-blue-50 dark:bg-blue-900/80 border border-blue-200 dark:border-blue-800 p-4 text-blue-900 dark:text-blue-100">
              {status}
            </div>
          )}
          {loading ? (
            <p className="text-gray-600 dark:text-gray-300">Memuat pertanyaan kuis...</p>
          ) : questions.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-300">Belum ada soal kuis yang tersedia.</p>
          ) : (
            <form onSubmit={handleSubmitQuiz} className="space-y-6">
              {questions.map((question, index) => (
                <div key={question.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                  <p className="font-semibold text-gray-900 dark:text-white mb-4">{index + 1}. {question.question}</p>
                  <div className="space-y-3">
                    {question.options.map((option) => (
                      <label key={option} className="flex items-center gap-3 cursor-pointer text-gray-700 dark:text-gray-200">
                        <input
                          type="radio"
                          name={question.id}
                          value={option}
                          checked={selectedAnswers[question.id] === option}
                          onChange={() => handleAnswerChange(question.id, option)}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <button
                type="submit"
                disabled={saving}
                className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-200 disabled:opacity-60"
              >
                {saving ? 'Menyimpan...' : 'Kirim Jawaban'}
              </button>
            </form>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Riwayat Kuis & Absensi</h2>
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Riwayat Kuis</h3>
              {results.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-300">Belum ada riwayat kuis.</p>
              ) : (
                <ul className="space-y-4">
                  {results.map((result) => (
                    <li key={result.id} className="rounded-2xl bg-gray-50 dark:bg-gray-900 p-4 border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center justify-between gap-4">
                        <p className="font-semibold text-gray-900 dark:text-white">Skor: {result.score}/{result.total}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {new Date(result.attemptedAt.seconds * 1000).toLocaleDateString('id-ID')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Riwayat Absensi</h3>
              {attendanceLoading ? (
                <p className="text-gray-600 dark:text-gray-300">Memuat riwayat absensi...</p>
              ) : attendanceHistory.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-300">Belum ada riwayat absensi.</p>
              ) : (
                <div className="space-y-4">
                  {attendanceHistory.map(({ session, attendance }) => (
                    <div key={session.id} className="rounded-2xl bg-gray-50 dark:bg-gray-900 p-4 border border-gray-200 dark:border-gray-700">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">{session.title}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{formatDate(session.date)}</p>
                        </div>
                        <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${getAttendanceBadgeClass(attendance?.status)}`}>
                          {getAttendanceLabel(attendance?.status)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mt-3">
                        Alasan izin: {attendance?.reason || '-'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
