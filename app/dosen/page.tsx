'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, addDoc, getDocs, Timestamp, doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import {
  createAttendanceSession,
  DEFAULT_COURSE_ID,
  getAttendanceSessionReport,
  getAttendanceSessions,
  isDeadlinePassed,
  type AttendanceReportItem,
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

interface QuizQuestionRecord {
  question?: string;
  options?: string[];
  correctAnswer?: string;
}

interface AttendanceFormState {
  title: string;
  date: string;
  deadline: string;
}

const COURSE_ID = DEFAULT_COURSE_ID;
export default function DosenPage() {
  const [user, setUser] = useState<User | null>(null);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [status, setStatus] = useState('');
  const [attendanceStatus, setAttendanceStatus] = useState('');
  const [attendanceForm, setAttendanceForm] = useState<AttendanceFormState>({
    title: '',
    date: '',
    deadline: '',
  });
  const [attendanceSessions, setAttendanceSessions] = useState<AttendanceSession[]>([]);
  const [attendanceReport, setAttendanceReport] = useState<AttendanceReportItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const formatDate = (value: string) =>
    new Date(value).toLocaleString('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

  const getAttendanceLabel = (attendanceState: string) => {
    if (attendanceState === 'hadir') return 'Hadir';
    if (attendanceState === 'izin') return 'Izin';
    return 'Tidak Hadir';
  };

  const getAttendanceBadgeClass = (attendanceState: string) => {
    if (attendanceState === 'hadir') {
      return 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200';
    }
    if (attendanceState === 'izin') {
      return 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-200';
    }
    return 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200';
  };

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
        if (firestoreData.role !== 'dosen' && firestoreData.role !== 'admin') {
          router.push('/login');
          return;
        }

        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email ?? userData.email,
          role: firestoreData.role,
        });
        await loadQuestions();

        setLoadingAttendance(true);
        try {
          const sessions = await getAttendanceSessions(COURSE_ID);
          setAttendanceSessions(sessions);

          const currentSessionId = sessions[0]?.id || '';
          if (currentSessionId) {
            const report = await getAttendanceSessionReport(currentSessionId);
            setSelectedSessionId(currentSessionId);
            setAttendanceReport(report);
          }
        } catch (attendanceError) {
          console.error('initial attendance load error', attendanceError);
          setAttendanceStatus('Gagal memuat data absensi.');
        } finally {
          setLoadingAttendance(false);
        }
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
      // Logging tidak boleh memblokir flow dosen.
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
      setStatus('Gagal memuat soal kuis.');
    } finally {
      setLoading(false);
    }
  };

  const loadAttendanceSessions = async () => {
    try {
      setLoadingAttendance(true);
      const sessions = await getAttendanceSessions(COURSE_ID);
      setAttendanceSessions(sessions);

      const currentSessionId = selectedSessionId || sessions[0]?.id || '';
      if (currentSessionId) {
        const report = await getAttendanceSessionReport(currentSessionId);
        setSelectedSessionId(currentSessionId);
        setAttendanceReport(report);
      } else {
        setSelectedSessionId('');
        setAttendanceReport([]);
      }
    } catch (err) {
      console.error('loadAttendanceSessions error', err);
      setAttendanceStatus('Gagal memuat data absensi.');
    } finally {
      setLoadingAttendance(false);
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    setOptions((prev) => prev.map((item, idx) => (idx === index ? value : item)));
  };

  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!question || options.some((opt) => !opt) || !correctAnswer) {
      setStatus('Lengkapi semua field soal dan pilih jawaban benar.');
      return;
    }

    try {
      setStatus('Menyimpan soal...');
      await addDoc(collection(db, 'quizQuestions'), {
        question,
        options,
        correctAnswer,
        authorUid: user.uid,
        authorEmail: user.email,
        createdAt: Timestamp.now(),
      });
      setStatus('Soal kuis berhasil ditambahkan.');
      setQuestion('');
      setOptions(['', '', '', '']);
      setCorrectAnswer('');
      await loadQuestions();
      void logRoleActivity('dosen.create_quiz', {
        question,
        totalOptions: options.length,
      });
    } catch (err) {
      console.error('submitQuestion error', err);
      setStatus('Gagal menambahkan soal kuis.');
    }
  };

  const handleAttendanceFormChange = (field: keyof AttendanceFormState, value: string) => {
    setAttendanceForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateAttendanceSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setAttendanceStatus('Menyimpan sesi absensi...');
      await createAttendanceSession({
        course_id: COURSE_ID,
        title: attendanceForm.title,
        date: attendanceForm.date,
        deadline: attendanceForm.deadline,
        created_by: user.uid,
      });
      setAttendanceForm({ title: '', date: '', deadline: '' });
      setAttendanceStatus('Sesi absensi berhasil dibuat.');
      await loadAttendanceSessions();
    } catch (err) {
      console.error('handleCreateAttendanceSession error', err);
      setAttendanceStatus(err instanceof Error ? err.message : 'Gagal membuat sesi absensi.');
    }
  };

  const handleViewAttendanceReport = async (sessionId: string) => {
    try {
      setLoadingAttendance(true);
      setSelectedSessionId(sessionId);
      const report = await getAttendanceSessionReport(sessionId);
      setAttendanceReport(report);
    } catch (err) {
      console.error('handleViewAttendanceReport error', err);
      setAttendanceStatus('Gagal memuat rekap absensi.');
    } finally {
      setLoadingAttendance(false);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('user');
    await signOut(auth);
    router.push('/login');
  };

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard Dosen</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2">
              Halo, <strong>{user.email}</strong> — pantau progres dan isi soal kuis untuk mahasiswa.
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
          >
            Logout
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Statistik Mahasiswa</h2>
            <p className="text-gray-600 dark:text-gray-300">Pantau rata-rata skor dan progres belajar kelas.</p>
          </div>
          <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Laporan Hasil</h2>
            <p className="text-gray-600 dark:text-gray-300">Lihat siapa yang sudah menyelesaikan modul dan kuis.</p>
          </div>
          <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Monitoring Akurasi</h2>
            <p className="text-gray-600 dark:text-gray-300">Cek apakah sistem AI sudah mencapai target akurasi ≥70%.</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Tambah Soal Kuis</h2>
          {status && (
            <div className="mb-6 rounded-xl bg-green-50 dark:bg-green-900/80 border border-green-200 dark:border-green-800 p-4 text-green-900 dark:text-green-100">
              {status}
            </div>
          )}
          <form onSubmit={handleSubmitQuestion} className="space-y-6">
            <div>
              <label className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Pertanyaan</label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {options.map((option, index) => (
                <div key={index}>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Pilihan {index + 1}</label>
                  <input
                    value={option}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    type="text"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Jawaban Benar</label>
              <select
                value={correctAnswer}
                onChange={(e) => setCorrectAnswer(e.target.value)}
                className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Pilih jawaban benar</option>
                {options.map((option, idx) => (
                  <option key={idx} value={option}>{option || `Pilihan ${idx + 1}`}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-200"
            >
              Tambah Soal
            </button>
          </form>
        </div>

        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Kelola Absensi Mahasiswa</h2>
          {attendanceStatus && (
            <div className="mb-6 rounded-xl bg-blue-50 dark:bg-blue-900/80 border border-blue-200 dark:border-blue-800 p-4 text-blue-900 dark:text-blue-100">
              {attendanceStatus}
            </div>
          )}
          <form onSubmit={handleCreateAttendanceSession} className="grid gap-4 md:grid-cols-2 mb-8">
            <div className="md:col-span-2">
              <label className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Judul Pertemuan</label>
              <input
                value={attendanceForm.title}
                onChange={(e) => handleAttendanceFormChange('title', e.target.value)}
                className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                type="text"
                placeholder="Contoh: Pertemuan 1"
              />
            </div>
            <div>
              <label className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Tanggal Pertemuan</label>
              <input
                value={attendanceForm.date}
                onChange={(e) => handleAttendanceFormChange('date', e.target.value)}
                className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                type="datetime-local"
              />
            </div>
            <div>
              <label className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Deadline Absensi</label>
              <input
                value={attendanceForm.deadline}
                onChange={(e) => handleAttendanceFormChange('deadline', e.target.value)}
                className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                type="datetime-local"
              />
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-200"
              >
                Buat Sesi Absensi
              </button>
            </div>
          </form>

          {loadingAttendance ? (
            <p className="text-gray-600 dark:text-gray-300">Memuat sesi absensi...</p>
          ) : attendanceSessions.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-300">Belum ada sesi absensi untuk course ini.</p>
          ) : (
            <div className="space-y-6">
              <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-200">Judul</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-200">Tanggal</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-200">Deadline</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-200">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-200">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                    {attendanceSessions.map((session) => (
                      <tr key={session.id}>
                        <td className="px-4 py-4 text-sm text-gray-900 dark:text-white">{session.title}</td>
                        <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">{formatDate(session.date)}</td>
                        <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">{formatDate(session.deadline)}</td>
                        <td className="px-4 py-4 text-sm">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${isDeadlinePassed(session.deadline) ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200' : 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200'}`}>
                            {isDeadlinePassed(session.deadline) ? 'Ditutup' : 'Aktif'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm">
                          <button
                            onClick={() => handleViewAttendanceReport(session.id)}
                            className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900"
                            type="button"
                          >
                            Lihat Rekap
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedSessionId && (
                <div className="rounded-2xl bg-gray-50 dark:bg-gray-900 p-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Rekap Absensi Mahasiswa</h3>
                  {attendanceReport.length === 0 ? (
                    <p className="text-gray-600 dark:text-gray-300">Belum ada data mahasiswa untuk sesi ini.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead>
                          <tr>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-200">Mahasiswa</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-200">Status</th>
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-200">Alasan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {attendanceReport.map((item) => (
                            <tr key={item.user_id}>
                              <td className="px-4 py-4 text-sm text-gray-900 dark:text-white">{item.email}</td>
                              <td className="px-4 py-4 text-sm">
                                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getAttendanceBadgeClass(item.status)}`}>
                                  {getAttendanceLabel(item.status)}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">{item.reason || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Daftar Soal Kuis</h2>
          {loading ? (
            <p className="text-gray-600 dark:text-gray-300">Memuat daftar soal...</p>
          ) : questions.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-300">Belum ada soal kuis yang ditambahkan.</p>
          ) : (
            <div className="space-y-4">
              {questions.map((question) => (
                <div key={question.id} className="rounded-2xl bg-gray-50 dark:bg-gray-900 p-5 border border-gray-200 dark:border-gray-700">
                  <p className="font-semibold text-gray-900 dark:text-white mb-3">{question.question}</p>
                  <div className="grid gap-2 sm:grid-cols-2 mb-3">
                    {question.options.map((option) => (
                      <span key={option} className="rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 px-3 py-2 text-sm">
                        {option}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Jawaban benar: <strong>{question.correctAnswer}</strong></p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
