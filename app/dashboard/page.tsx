'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { Timestamp, addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import {
  DEFAULT_COURSE_ID,
  createAttendanceSession,
  getAttendanceSessionReport,
  getAttendanceSessions,
  getStudentAttendanceHistory,
  isDeadlinePassed,
  submitAttendance,
  type AttendanceRecord,
  type AttendanceReportItem,
  type AttendanceSession,
} from '../../lib/attendance';

type Role = 'admin' | 'dosen' | 'mahasiswa';
type Tab = 'materials' | 'quiz' | 'attendance' | 'users' | 'chatbot';

interface UserInfo {
  uid: string;
  email: string;
  role: Role;
}

interface Material {
  id: string;
  title: string;
  description: string;
  content: string;
  authorEmail: string;
  createdAt?: { seconds: number };
  filePath?: string;
  fileName?: string;
}

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  authorEmail?: string;
}

interface QuizResult {
  id: string;
  userUid: string;
  userEmail: string;
  score: number;
  total: number;
  attemptedAt?: { seconds: number };
}

interface FirestoreErrorLike {
  code?: string;
  message?: string;
}

interface EmailSample {
  id: number;
  text: string;
  label: 'phishing' | 'legit';
}

interface DetectorResult {
  label: 'phishing' | 'legit';
  confidence: number;
  indicators: string[];
  explanation: string;
}

interface AttendanceHistoryItem {
  session: AttendanceSession;
  attendance: AttendanceRecord | null;
}

const emptyOptions = ['', '', '', ''];
const emptyAttendanceForm = { title: '', date: '', deadline: '' };

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [authUser, setAuthUser] = useState<FirebaseUser | null | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<Tab>('materials');
  const [status, setStatus] = useState('');
  const [quizStatus, setQuizStatus] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');

  const [materials, setMaterials] = useState<Material[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [attendanceStatus, setAttendanceStatus] = useState('');
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [attendanceSessions, setAttendanceSessions] = useState<AttendanceSession[]>([]);
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceHistoryItem[]>([]);
  const [attendanceReport, setAttendanceReport] = useState<AttendanceReportItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [attendanceChoices, setAttendanceChoices] = useState<Record<string, 'hadir' | 'izin'>>({});
  const [attendanceReasons, setAttendanceReasons] = useState<Record<string, string>>({});
  const [attendanceSavingId, setAttendanceSavingId] = useState('');
  const [attendanceForm, setAttendanceForm] = useState(emptyAttendanceForm);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const [quizQuestion, setQuizQuestion] = useState('');
  const [quizOptions, setQuizOptions] = useState<string[]>(emptyOptions);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [emailSamples, setEmailSamples] = useState<EmailSample[]>([]);
  const [selectedEmail, setSelectedEmail] = useState('');
  const [selectedPrediction, setSelectedPrediction] = useState<'phishing' | 'legit' | ''>('');
  const [detectorResult, setDetectorResult] = useState<DetectorResult | null>(null);
  const [detectorLoading, setDetectorLoading] = useState(false);
  const [detectorScore, setDetectorScore] = useState(0);
  const [metrics, setMetrics] = useState<{ total: number; correct: number; accuracy: number; target: number; passed: boolean } | null>(null);

  const canUpload = useMemo(() => user?.role === 'admin' || user?.role === 'dosen', [user]);
  const canManageUsers = useMemo(() => user?.role === 'admin', [user]);
  const canManageQuiz = useMemo(() => user?.role === 'admin' || user?.role === 'dosen', [user]);
  const canTakeQuiz = useMemo(() => user?.role === 'mahasiswa', [user]);
  const canManageAttendance = useMemo(() => user?.role === 'admin' || user?.role === 'dosen', [user]);
  const canTakeAttendance = useMemo(() => user?.role === 'mahasiswa', [user]);
  const bestScore = useMemo(() => results.reduce((best, item) => Math.max(best, item.score), 0), [results]);
  const bestResult = useMemo(() => results.reduce<QuizResult | null>((best, item) => {
    if (!best || item.score > best.score) return item;
    return best;
  }, null), [results]);
  const latestResult = useMemo(() => results[0] ?? null, [results]);
  const averageScore = useMemo(() => {
    if (results.length === 0) return 0;
    return results.reduce((sum, item) => sum + (item.total > 0 ? (item.score / item.total) * 100 : 0), 0) / results.length;
  }, [results]);
  const hasCompletedQuiz = useMemo(() => results.length > 0, [results]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setAuthUser(firebaseUser);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (authUser === undefined) {
      return;
    }

    const init = async () => {
      try {
        const stored = localStorage.getItem('user');
        if (!stored) return router.push('/login');

        if (!auth.currentUser) {
          return;
        }

        const parsed = JSON.parse(stored) as UserInfo;
        if (auth.currentUser.uid !== parsed.uid) {
          localStorage.removeItem('user');
          return router.push('/login');
        }

        const snap = await getDoc(doc(db, 'users', parsed.uid));
        if (!snap.exists()) return router.push('/login');
        const verified = { uid: parsed.uid, email: parsed.email, role: snap.data().role as Role };
        setUser(verified);
        await Promise.all([
          loadMaterials(),
          verified.role === 'admin' ? loadUsers() : Promise.resolve(),
        ]);
      } catch {
        router.push('/login');
      }
    };

    if (authUser) {
      init();
    } else if (authUser === null) {
      localStorage.removeItem('user');
      router.push('/login');
    }
  }, [authUser, router]);

  useEffect(() => {
    if (!user || activeTab !== 'quiz') {
      return;
    }

    void loadQuestions();

    if (user.role === 'mahasiswa') {
      void Promise.all([loadResults(user.uid), loadEmailSamples(), loadMetrics()]);
    }
  }, [activeTab, user]);

  useEffect(() => {
    if (!canTakeQuiz) {
      return;
    }

    const storedScore = localStorage.getItem('detectorScore');
    if (!storedScore) {
      return;
    }

    const parsed = Number(storedScore);
    if (!Number.isNaN(parsed) && parsed > 0) {
      setDetectorScore(parsed);
    }
  }, [canTakeQuiz]);

  const loadMaterials = async () => {
    try {
      setLoadingMaterials(true);
      const snap = await getDocs(collection(db, 'materials'));
      setMaterials(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Material, 'id'>) })));
    } catch {
      setStatus('Gagal memuat materi.');
    } finally {
      setLoadingMaterials(false);
    }
  };

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const snap = await getDocs(collection(db, 'users'));
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<UserInfo, 'uid'>) })));
    } catch {
      setStatus('Gagal memuat daftar pengguna.');
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadQuestions = async () => {
    try {
      setLoadingQuestions(true);
      setQuizStatus('');
      const snap = await getDocs(collection(db, 'quizQuestions'));
      setQuestions(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<QuizQuestion, 'id'>) })));
    } catch (err) {
      const error = err as FirestoreErrorLike;
      if (error.code === 'permission-denied') {
        setQuizStatus('Gagal memuat soal quiz: akses Firestore ditolak. Deploy rules terbaru lalu login ulang.');
      } else if (error.message) {
        setQuizStatus(`Gagal memuat soal quiz: ${error.message}`);
      } else {
        setQuizStatus('Gagal memuat soal quiz.');
      }
    } finally {
      setLoadingQuestions(false);
    }
  };

  const loadResults = async (uid: string) => {
    try {
      setLoadingResults(true);
      const resultsQuery = query(collection(db, 'quizResults'), where('userUid', '==', uid));
      const snap = await getDocs(resultsQuery);
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<QuizResult, 'id'>) }))
        .sort((a, b) => (b.attemptedAt?.seconds || 0) - (a.attemptedAt?.seconds || 0));
      setResults(rows);
    } catch (err) {
      const error = err as FirestoreErrorLike;
      if (error.code === 'permission-denied') {
        setQuizStatus('Gagal memuat riwayat quiz: akses Firestore ditolak. Login ulang setelah rules terbaru di-deploy.');
      } else {
        setQuizStatus(error.message || 'Gagal memuat riwayat quiz.');
      }
    } finally {
      setLoadingResults(false);
    }
  };

  const loadAttendanceSessions = useCallback(async (loadReport = false) => {
    try {
      setLoadingAttendance(true);
      setAttendanceStatus('');
      const sessions = await getAttendanceSessions(DEFAULT_COURSE_ID);
      setAttendanceSessions(sessions);

      if (!loadReport) {
        return;
      }

      const nextSessionId = selectedSessionId || sessions[0]?.id || '';
      setSelectedSessionId(nextSessionId);

      if (!nextSessionId) {
        setAttendanceReport([]);
        return;
      }

      const report = await getAttendanceSessionReport(nextSessionId);
      setAttendanceReport(report);
    } catch (err) {
      const error = err as FirestoreErrorLike;
      setAttendanceStatus(error.message || 'Gagal memuat data absensi.');
    } finally {
      setLoadingAttendance(false);
    }
  }, [selectedSessionId]);

  const loadAttendanceHistory = useCallback(async (uid: string) => {
    try {
      setLoadingAttendance(true);
      setAttendanceStatus('');
      const history = await getStudentAttendanceHistory(DEFAULT_COURSE_ID, uid);
      setAttendanceHistory(history);
    } catch (err) {
      const error = err as FirestoreErrorLike;
      setAttendanceStatus(error.message || 'Gagal memuat riwayat absensi.');
    } finally {
      setLoadingAttendance(false);
    }
  }, []);

  useEffect(() => {
    if (!user || activeTab !== 'attendance') {
      return;
    }

    if (canManageAttendance) {
      void loadAttendanceSessions(true);
      return;
    }

    if (canTakeAttendance) {
      void loadAttendanceHistory(user.uid);
    }
  }, [activeTab, canManageAttendance, canTakeAttendance, loadAttendanceHistory, loadAttendanceSessions, user]);

  const loadEmailSamples = async () => {
    try {
      const res = await fetch('/api/emails');
      if (!res.ok) throw new Error('Gagal memuat dataset email.');
      const data = await res.json();
      setEmailSamples(data);
    } catch (err) {
      const error = err as FirestoreErrorLike;
      setStatus(error.message || 'Gagal memuat dataset email.');
    }
  };

  const loadMetrics = async () => {
    try {
      const res = await fetch('/api/metrics');
      if (!res.ok) throw new Error('Gagal memuat metrik AI.');
      const data = await res.json();
      setMetrics(data);
    } catch (err) {
      const error = err as FirestoreErrorLike;
      setStatus(error.message || 'Gagal memuat metrik AI.');
    }
  };

  const handleUploadMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !canUpload) return setStatus('Anda tidak berwenang mengunggah materi.');
    if (!auth.currentUser || auth.currentUser.uid !== user.uid) return setStatus('Sesi login belum aktif. Silakan login ulang.');
    if (!title || !content) return setStatus('Judul dan konten wajib diisi.');
    try {
      setStatus('Menyimpan materi...');
      let filePath = '';
      let fileName = '';
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal upload file.');
        filePath = data.filePath;
        fileName = data.fileName;
      }
      await addDoc(collection(db, 'materials'), { title, description, content, authorUid: user.uid, authorEmail: user.email, createdAt: Timestamp.now(), filePath, fileName });
      setTitle('');
      setDescription('');
      setContent('');
      setFile(null);
      setStatus('Materi berhasil diunggah.');
      await loadMaterials();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Gagal mengunggah materi.');
    }
  };

  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !canManageQuiz) return setStatus('Anda tidak berwenang menambah soal quiz.');
    if (!auth.currentUser || auth.currentUser.uid !== user.uid) return setStatus('Sesi login belum aktif. Silakan login ulang.');
    if (!quizQuestion || quizOptions.some((item) => !item.trim()) || !correctAnswer) return setStatus('Lengkapi pertanyaan, opsi, dan jawaban benar.');
    try {
      setSavingQuiz(true);
      setQuizStatus('Menyimpan soal quiz...');
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch('/api/quiz-questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          question: quizQuestion,
          options: quizOptions,
          correctAnswer,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Gagal menambahkan soal quiz.');
      }
      setQuizQuestion('');
      setQuizOptions([...emptyOptions]);
      setCorrectAnswer('');
      setQuizStatus('Soal quiz berhasil ditambahkan.');
      await loadQuestions();
    } catch (err) {
      const error = err as FirestoreErrorLike;
      setQuizStatus(error.message || 'Gagal menambahkan soal quiz.');
    } finally {
      setSavingQuiz(false);
    }
  };

  const handleSubmitQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !canTakeQuiz) return setStatus('Hanya mahasiswa yang dapat mengerjakan quiz.');
    if (!auth.currentUser || auth.currentUser.uid !== user.uid) return setStatus('Sesi login belum aktif. Silakan login ulang.');
    if (hasCompletedQuiz) return setQuizStatus('Quiz ini sudah pernah Anda kerjakan dan tidak bisa diulang.');
    if (questions.length === 0) return setStatus('Belum ada soal quiz.');
    if (questions.some((q) => !selectedAnswers[q.id])) return setStatus('Jawab semua soal terlebih dahulu.');
    const score = questions.reduce((sum, q) => sum + (selectedAnswers[q.id] === q.correctAnswer ? 1 : 0), 0);
    try {
      setSavingQuiz(true);
      setQuizStatus('Menyimpan hasil quiz...');
      await addDoc(collection(db, 'quizResults'), { userUid: user.uid, userEmail: user.email, score, total: questions.length, answers: selectedAnswers, attemptedAt: Timestamp.now() });
      setSelectedAnswers({});
      setQuizStatus(`Quiz selesai. Skor Anda ${score} dari ${questions.length}.`);
      await loadResults(user.uid);
    } catch (err) {
      const error = err as FirestoreErrorLike;
      setQuizStatus(error.message || 'Gagal menyimpan hasil quiz.');
    } finally {
      setSavingQuiz(false);
    }
  };

  const handleCreateAttendanceSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !canManageAttendance) return setAttendanceStatus('Anda tidak berwenang membuat sesi absensi.');
    try {
      setSavingAttendance(true);
      setAttendanceStatus('Menyimpan sesi absensi...');
      await createAttendanceSession({
        course_id: DEFAULT_COURSE_ID,
        title: attendanceForm.title,
        date: attendanceForm.date,
        deadline: attendanceForm.deadline,
        created_by: user.uid,
      });
      setAttendanceForm(emptyAttendanceForm);
      setAttendanceStatus('Sesi absensi berhasil dibuat.');
      await loadAttendanceSessions(true);
    } catch (err) {
      const error = err as FirestoreErrorLike;
      setAttendanceStatus(error.message || 'Gagal membuat sesi absensi.');
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleViewAttendanceReport = async (sessionId: string) => {
    try {
      setLoadingAttendance(true);
      setAttendanceStatus('');
      setSelectedSessionId(sessionId);
      const report = await getAttendanceSessionReport(sessionId);
      setAttendanceReport(report);
    } catch (err) {
      const error = err as FirestoreErrorLike;
      setAttendanceStatus(error.message || 'Gagal memuat rekap absensi.');
    } finally {
      setLoadingAttendance(false);
    }
  };

  const handleSubmitAttendance = async (sessionId: string) => {
    if (!user || !canTakeAttendance) return setAttendanceStatus('Hanya mahasiswa yang dapat mengirim absensi.');

    const selectedStatus = attendanceChoices[sessionId] || 'hadir';
    const reason = attendanceReasons[sessionId] || '';

    try {
      setAttendanceSavingId(sessionId);
      setAttendanceStatus('Menyimpan absensi...');
      await submitAttendance(sessionId, user.uid, selectedStatus, reason);
      setAttendanceStatus('Absensi berhasil dikirim.');
      await loadAttendanceHistory(user.uid);
    } catch (err) {
      const error = err as FirestoreErrorLike;
      setAttendanceStatus(error.message || 'Gagal mengirim absensi.');
    } finally {
      setAttendanceSavingId('');
    }
  };

  const handleDetectorCheck = async () => {
    if (!selectedEmail || !selectedPrediction) {
      setStatus('Pilih email simulasi dan jawaban Anda terlebih dahulu.');
      return;
    }

    try {
      setDetectorLoading(true);
      setStatus('Menganalisis email dengan AI detector...');
      const res = await fetch('/api/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: selectedEmail }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal melakukan klasifikasi email.');
      }

      setDetectorResult(data);

      if (data.label === selectedPrediction) {
        const nextScore = detectorScore + 10;
        setDetectorScore(nextScore);
        localStorage.setItem('detectorScore', String(nextScore));
        setStatus('Jawaban benar. Anda mendapat 10 poin.');
      } else {
        setStatus('Jawaban belum tepat. Skor tidak bertambah.');
      }
    } catch (err) {
      const error = err as FirestoreErrorLike;
      setStatus(error.message || 'Gagal menjalankan AI detector.');
    } finally {
      setDetectorLoading(false);
    }
  };

  const updateUserRole = async (uid: string, role: Role) => {
    try {
      if (!auth.currentUser) {
        setStatus('Sesi login belum aktif. Silakan login ulang.');
        return;
      }
      await updateDoc(doc(db, 'users', uid), { role });
      setStatus('Role berhasil diperbarui.');
      await loadUsers();
    } catch {
      setStatus('Gagal memperbarui role pengguna.');
    }
  };

  const handleChatBot = async (e: React.FormEvent) => {
    e.preventDefault();
    const apikey = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
    if (!prompt) return setStatus('Masukkan pertanyaan ke chatbot.');
    if (!apikey) return setStatus('OpenRouter API key belum diset.');
    try {
      setChatLoading(true);
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apikey}` },
        body: JSON.stringify({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 512 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error('Gagal menghubungi AI.');
      setResponse(data?.choices?.[0]?.message?.content || 'AI tidak memberikan jawaban.');
      setStatus('Balasan AI tersedia.');
    } catch {
      setStatus('Gagal menghubungi AI.');
    } finally {
      setChatLoading(false);
    }
  };

  const formatDate = (seconds?: number) => (seconds ? new Date(seconds * 1000).toLocaleDateString('id-ID') : '-');
  const formatAttendanceDate = (value?: string | Timestamp | Date | null) => {
    if (!value) return '-';
    const date =
      value instanceof Timestamp
        ? value.toDate()
        : value instanceof Date
          ? value
          : new Date(value);
    return Number.isNaN(date.getTime())
      ? '-'
      : date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  };
  const getAttendanceLabel = (attendanceState?: string | null) => {
    if (attendanceState === 'hadir') return 'Hadir';
    if (attendanceState === 'izin') return 'Izin';
    return 'Tidak Hadir';
  };
  const getAttendanceBadgeClass = (attendanceState?: string | null) => {
    if (attendanceState === 'hadir') {
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
    }
    if (attendanceState === 'izin') {
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
    }
    return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300';
  };
  const handleLogout = async () => {
    localStorage.removeItem('user');
    try {
      await signOut(auth);
    } catch {
      // Ignore logout cleanup errors and continue redirecting.
    }
    router.push('/login');
  };
  const cardClass = 'bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/20';
  const inputClass = 'block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200';
  const ghostButtonClass = 'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200';
  const activeNavClass = 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg';
  const idleNavClass = 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700';

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-blue-900 dark:to-purple-900 flex items-center justify-center p-4">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-indigo-400/20 to-pink-400/20 rounded-full blur-3xl"></div>
        </div>
        <div className="relative text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Memuat dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-blue-900 dark:to-purple-900 p-4 lg:p-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-indigo-400/20 to-pink-400/20 rounded-full blur-3xl"></div>
      </div>

      <div className="relative mx-auto grid max-w-7xl gap-6 lg:grid-cols-[260px_1fr]">
        <aside className={`${cardClass} p-5 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]`}>
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl mb-4 shadow-lg">
              <span className="text-white font-bold">CS</span>
            </div>
            <div className="text-xl font-bold text-gray-900 dark:text-white">CyberSec Learn</div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 break-all">{user.email}</div>
            <div className="mt-3 inline-flex rounded-full bg-blue-50 dark:bg-blue-900/30 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
              Role: {user.role}
            </div>
          </div>

          <div className="space-y-2">
            {(['materials', 'quiz', 'attendance', 'chatbot'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`${ghostButtonClass} ${activeTab === tab ? activeNavClass : idleNavClass}`}
              >
                <span className="capitalize font-medium">{tab}</span>
              </button>
            ))}
            {canManageUsers && (
              <button
                onClick={() => setActiveTab('users')}
                className={`${ghostButtonClass} ${activeTab === 'users' ? activeNavClass : idleNavClass}`}
              >
                <span className="font-medium">Users</span>
              </button>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="mt-6 w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
          >
            Logout
          </button>
        </aside>

        <main className="space-y-6">
          <section className={`${cardClass} p-6 md:p-8`}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  Dashboard Pembelajaran
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  Materi, quiz, absensi, pengguna, dan AI assistant sekarang ada dalam satu alur yang konsisten.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-white/70 dark:bg-gray-700/60 px-4 py-3 border border-white/30 dark:border-gray-600/30">
                  <div className="text-gray-500 dark:text-gray-400">Materi</div>
                  <div className="text-xl font-bold text-gray-900 dark:text-white">{materials.length}</div>
                </div>
                <div className="rounded-xl bg-white/70 dark:bg-gray-700/60 px-4 py-3 border border-white/30 dark:border-gray-600/30">
                  <div className="text-gray-500 dark:text-gray-400">Quiz</div>
                  <div className="text-xl font-bold text-gray-900 dark:text-white">{questions.length}</div>
                </div>
                <div className="rounded-xl bg-white/70 dark:bg-gray-700/60 px-4 py-3 border border-white/30 dark:border-gray-600/30">
                  <div className="text-gray-500 dark:text-gray-400">Absensi</div>
                  <div className="text-xl font-bold text-gray-900 dark:text-white">{attendanceSessions.length}</div>
                </div>
              </div>
            </div>

            {status && (
              <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <p className="text-sm text-blue-700 dark:text-blue-300">{status}</p>
              </div>
            )}
          </section>

          {activeTab === 'materials' && (
            <div className="space-y-6">
              {canUpload && (
                <section className={`${cardClass} p-6 md:p-8`}>
                  <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">Upload Materi</h2>
                  <p className="mb-6 text-gray-600 dark:text-gray-400">Tambahkan modul baru dengan gaya form yang sama seperti login dan register.</p>
                  <form onSubmit={handleUploadMaterial} className="grid gap-4">
                    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul materi" className={inputClass} />
                    <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Deskripsi singkat" className={inputClass} />
                    <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Konten materi" rows={6} className={`${inputClass} resize-none`} />
                    <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className={`${inputClass} file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100`} />
                    <button className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl">Simpan Materi</button>
                  </form>
                </section>
              )}

              <section className={`${cardClass} p-6 md:p-8`}>
                <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">Daftar Materi</h2>
                {loadingMaterials ? <p className="text-gray-600 dark:text-gray-400">Memuat materi...</p> : materials.length === 0 ? <p className="text-gray-600 dark:text-gray-400">Belum ada materi.</p> : (
                  <div className="space-y-4">
                    {materials.map((material) => (
                      <article key={material.id} className="bg-gradient-to-r from-white to-gray-50 dark:from-gray-700 dark:to-gray-600 rounded-2xl shadow-lg border border-white/20 dark:border-gray-600/20 p-5">
                        <div className="text-lg font-semibold text-gray-900 dark:text-white">{material.title}</div>
                        {material.description && <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">{material.description}</div>}
                        <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">{material.content}</p>
                        <div className="mt-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                          <span>{material.authorEmail}</span>
                          <span>{formatDate(material.createdAt?.seconds)}</span>
                        </div>
                        {material.filePath && <a href={material.filePath} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-blue-600 hover:text-blue-500 dark:text-blue-400">Download {material.fileName}</a>}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === 'quiz' && (
            <div className="space-y-6">
              {quizStatus && (
                <section className={`${cardClass} p-4 md:p-5`}>
                  <p className="text-sm text-gray-700 dark:text-gray-200">{quizStatus}</p>
                </section>
              )}

              {canTakeQuiz && (
                <section className={`${cardClass} p-6 md:p-8`}>
                  <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">Statistik Hasil Quiz</h2>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl bg-white/70 dark:bg-gray-700/60 px-4 py-4 border border-white/30 dark:border-gray-600/30">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Total Pengerjaan</div>
                      <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{results.length}</div>
                    </div>
                    <div className="rounded-xl bg-white/70 dark:bg-gray-700/60 px-4 py-4 border border-white/30 dark:border-gray-600/30">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Skor Tertinggi</div>
                      <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                        {bestResult ? `${bestScore}/${bestResult.total}` : '-'}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white/70 dark:bg-gray-700/60 px-4 py-4 border border-white/30 dark:border-gray-600/30">
                      <div className="text-sm text-gray-500 dark:text-gray-400">Rata-rata</div>
                      <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
                        {results.length > 0 ? `${averageScore.toFixed(0)}%` : '-'}
                      </div>
                    </div>
                  </div>

                  {latestResult && (
                    <div className="mt-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        Percobaan terakhir: skor {latestResult.score}/{latestResult.total} pada {formatDate(latestResult.attemptedAt?.seconds)}.
                      </p>
                    </div>
                  )}
                </section>
              )}

              {canTakeQuiz && (
                <section className={`${cardClass} p-6 md:p-8`}>
                  <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">Simulasi Email Phishing</h2>
                  <p className="mb-6 text-gray-600 dark:text-gray-400">Latihan mendeteksi email phishing menggunakan rule-based AI detector tanpa mengubah alur quiz yang sudah ada.</p>

                  {metrics && (
                    <div className="mb-6 grid gap-4 md:grid-cols-4">
                      <div className="rounded-xl bg-white/70 dark:bg-gray-700/60 px-4 py-4 border border-white/30 dark:border-gray-600/30">
                        <div className="text-sm text-gray-500 dark:text-gray-400">Total Data</div>
                        <div className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{metrics.total}</div>
                      </div>
                      <div className="rounded-xl bg-white/70 dark:bg-gray-700/60 px-4 py-4 border border-white/30 dark:border-gray-600/30">
                        <div className="text-sm text-gray-500 dark:text-gray-400">Jumlah Benar</div>
                        <div className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{metrics.correct}</div>
                      </div>
                      <div className="rounded-xl bg-white/70 dark:bg-gray-700/60 px-4 py-4 border border-white/30 dark:border-gray-600/30">
                        <div className="text-sm text-gray-500 dark:text-gray-400">Accuracy</div>
                        <div className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{metrics.accuracy}%</div>
                      </div>
                      <div className="rounded-xl bg-white/70 dark:bg-gray-700/60 px-4 py-4 border border-white/30 dark:border-gray-600/30">
                        <div className="text-sm text-gray-500 dark:text-gray-400">Skor Simulasi</div>
                        <div className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{detectorScore}</div>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4">
                    <select
                      value={selectedEmail}
                      onChange={(e) => {
                        setSelectedEmail(e.target.value);
                        setDetectorResult(null);
                        setSelectedPrediction('');
                      }}
                      className={inputClass}
                    >
                      <option value="">Pilih contoh email untuk dianalisis</option>
                      {emailSamples.map((item) => (
                        <option key={item.id} value={item.text}>
                          Email #{item.id}
                        </option>
                      ))}
                    </select>

                    {selectedEmail && (
                      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-700/40 p-4 whitespace-pre-wrap text-gray-700 dark:text-gray-200">
                        {selectedEmail}
                      </div>
                    )}

                    <div className="grid gap-3 md:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setSelectedPrediction('phishing')}
                        className={`rounded-xl border px-4 py-3 font-semibold transition-all duration-200 ${
                          selectedPrediction === 'phishing'
                            ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300'
                            : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'
                        }`}
                      >
                        Phishing
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedPrediction('legit')}
                        className={`rounded-xl border px-4 py-3 font-semibold transition-all duration-200 ${
                          selectedPrediction === 'legit'
                            ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-300'
                            : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'
                        }`}
                      >
                        Aman
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleDetectorCheck}
                      disabled={!selectedEmail || !selectedPrediction || detectorLoading}
                      className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg hover:shadow-xl"
                    >
                      {detectorLoading ? 'Memproses...' : 'Cek dengan AI Detector'}
                    </button>

                    {detectorResult && (
                      <div className="space-y-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-700/40 p-4">
                        <p className="text-gray-700 dark:text-gray-200"><strong>Label:</strong> {detectorResult.label}</p>
                        <p className="text-gray-700 dark:text-gray-200"><strong>Confidence:</strong> {Math.round(detectorResult.confidence * 100)}%</p>
                        <div className="text-gray-700 dark:text-gray-200">
                          <strong>Indicators:</strong>
                          <ul className="list-disc pl-5 mt-2 space-y-1">
                            {detectorResult.indicators.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        <p className="text-gray-700 dark:text-gray-200"><strong>Explanation:</strong> {detectorResult.explanation}</p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {canManageQuiz && (
                <section className={`${cardClass} p-6 md:p-8`}>
                  <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">Tambah Soal Quiz</h2>
                  <p className="mb-6 text-gray-600 dark:text-gray-400">Gunakan kartu quiz dengan gaya visual yang sama seperti form autentikasi.</p>
                  <form onSubmit={handleSubmitQuestion} className="grid gap-4">
                    <textarea value={quizQuestion} onChange={(e) => setQuizQuestion(e.target.value)} rows={4} placeholder="Pertanyaan" className={`${inputClass} resize-none`} />
                    <div className="grid gap-4 md:grid-cols-2">
                      {quizOptions.map((option, index) => (
                        <input
                          key={index}
                          value={option}
                          onChange={(e) => setQuizOptions((prev) => prev.map((item, idx) => idx === index ? e.target.value : item))}
                          placeholder={`Pilihan ${index + 1}`}
                          className={inputClass}
                        />
                      ))}
                    </div>
                    <select value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} className={inputClass}>
                      <option value="">Pilih jawaban benar</option>
                      {quizOptions.map((option, index) => <option key={index} value={option}>{option || `Pilihan ${index + 1}`}</option>)}
                    </select>
                    <button type="submit" disabled={savingQuiz} className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg hover:shadow-xl">{savingQuiz ? 'Menyimpan...' : 'Tambah Soal'}</button>
                  </form>
                </section>
              )}

              {canTakeQuiz && (
                <section className={`${cardClass} p-6 md:p-8`}>
                  <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">Kerjakan Quiz</h2>
                  {loadingQuestions ? <p className="text-gray-600 dark:text-gray-400">Memuat quiz...</p> : questions.length === 0 ? <p className="text-gray-600 dark:text-gray-400">Belum ada quiz.</p> : hasCompletedQuiz ? (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                      Quiz sudah Anda kerjakan. Untuk menjaga integritas penilaian, pengerjaan ulang dinonaktifkan.
                    </div>
                  ) : (
                    <form onSubmit={handleSubmitQuiz} className="space-y-4">
                      {questions.map((question, index) => (
                        <div key={question.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-700/40 p-5">
                          <div className="font-semibold text-gray-900 dark:text-white">{index + 1}. {question.question}</div>
                          <div className="mt-3 space-y-2">
                            {question.options.map((option) => (
                              <label key={option} className="flex items-center gap-3 text-gray-700 dark:text-gray-200">
                                <input type="radio" name={question.id} checked={selectedAnswers[question.id] === option} onChange={() => setSelectedAnswers((prev) => ({ ...prev, [question.id]: option }))} />
                                <span>{option}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                      <button type="submit" disabled={savingQuiz} className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg hover:shadow-xl">{savingQuiz ? 'Menyimpan...' : 'Kirim Jawaban'}</button>
                    </form>
                  )}
                </section>
              )}

              <section className={`${cardClass} p-6 md:p-8`}>
                <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">{canTakeQuiz ? 'Riwayat Quiz' : 'Daftar Soal Quiz'}</h2>
                {canTakeQuiz ? (
                  loadingResults ? <p className="text-gray-600 dark:text-gray-400">Memuat riwayat...</p> : results.length === 0 ? <p className="text-gray-600 dark:text-gray-400">Belum ada riwayat quiz.</p> : (
                    <div className="space-y-3">
                      {results.map((result) => (
                        <div key={result.id} className="flex items-center justify-between rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-700/40 p-4">
                          <div>
                            <div className="font-semibold text-gray-900 dark:text-white">Skor: {result.score}/{result.total}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">{result.userEmail}</div>
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{formatDate(result.attemptedAt?.seconds)}</div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  loadingQuestions ? <p className="text-gray-600 dark:text-gray-400">Memuat soal quiz...</p> : questions.length === 0 ? <p className="text-gray-600 dark:text-gray-400">Belum ada soal quiz.</p> : (
                    <div className="space-y-3">
                      {questions.map((question) => (
                        <div key={question.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-700/40 p-4">
                          <div className="font-semibold text-gray-900 dark:text-white">{question.question}</div>
                          <div className="mt-2 flex flex-wrap gap-2 text-sm">
                            {question.options.map((option, index) => <span key={index} className="rounded-full bg-blue-50 dark:bg-blue-900/30 px-3 py-1 text-blue-700 dark:text-blue-300">{option}</span>)}
                          </div>
                          <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">Jawaban benar: {question.correctAnswer}</div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </section>
            </div>
          )}

          {activeTab === 'users' && canManageUsers && (
            <section className={`${cardClass} p-6 md:p-8`}>
              <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">Manajemen User</h2>
              {loadingUsers ? <p className="text-gray-600 dark:text-gray-400">Memuat pengguna...</p> : (
                <div className="space-y-3">
                  {users.map((listedUser) => (
                    <div key={listedUser.uid} className="flex flex-col gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-700/40 p-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white">{listedUser.email}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{listedUser.role}</div>
                      </div>
                      <div className="flex gap-3">
                        <select value={listedUser.role} onChange={async (e) => { await updateUserRole(listedUser.uid, e.target.value as Role); }} className={inputClass}>
                          <option value="mahasiswa">Mahasiswa</option>
                          <option value="dosen">Dosen</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button onClick={async () => { await deleteDoc(doc(db, 'users', listedUser.uid)); setStatus('Pengguna berhasil dihapus.'); await loadUsers(); }} className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 font-semibold">Hapus</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === 'attendance' && (
            <div className="space-y-6">
              {attendanceStatus && (
                <section className={`${cardClass} p-4 md:p-5`}>
                  <p className="text-sm text-gray-700 dark:text-gray-200">{attendanceStatus}</p>
                </section>
              )}

              {canManageAttendance && (
                <>
                  <section className={`${cardClass} p-6 md:p-8`}>
                    <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">Buat Sesi Absensi</h2>
                    <p className="mb-6 text-gray-600 dark:text-gray-400">Atur pertemuan dan deadline absensi langsung dari dashboard.</p>
                    <form onSubmit={handleCreateAttendanceSession} className="grid gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <input
                          value={attendanceForm.title}
                          onChange={(e) => setAttendanceForm((prev) => ({ ...prev, title: e.target.value }))}
                          placeholder="Judul pertemuan"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Tanggal Pertemuan</label>
                        <input
                          type="datetime-local"
                          value={attendanceForm.date}
                          onChange={(e) => setAttendanceForm((prev) => ({ ...prev, date: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Deadline Absensi</label>
                        <input
                          type="datetime-local"
                          value={attendanceForm.deadline}
                          onChange={(e) => setAttendanceForm((prev) => ({ ...prev, deadline: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={savingAttendance}
                        className="md:col-span-2 w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg hover:shadow-xl"
                      >
                        {savingAttendance ? 'Menyimpan...' : 'Buat Sesi Absensi'}
                      </button>
                    </form>
                  </section>

                  <section className={`${cardClass} p-6 md:p-8`}>
                    <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">Kelola Sesi & Rekap</h2>
                    {loadingAttendance ? (
                      <p className="text-gray-600 dark:text-gray-400">Memuat data absensi...</p>
                    ) : attendanceSessions.length === 0 ? (
                      <p className="text-gray-600 dark:text-gray-400">Belum ada sesi absensi.</p>
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
                                  <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">{formatAttendanceDate(session.date)}</td>
                                  <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">{formatAttendanceDate(session.deadline)}</td>
                                  <td className="px-4 py-4 text-sm">
                                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${isDeadlinePassed(session.deadline) ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
                                      {isDeadlinePassed(session.deadline) ? 'Ditutup' : 'Aktif'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-4 text-sm">
                                    <button
                                      type="button"
                                      onClick={() => handleViewAttendanceReport(session.id)}
                                      className="rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900"
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
                            <h3 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Rekap Kehadiran Mahasiswa</h3>
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
                                          <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${getAttendanceBadgeClass(item.status)}`}>
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
                  </section>
                </>
              )}

              {canTakeAttendance && (
                <>
                  <section className={`${cardClass} p-6 md:p-8`}>
                    <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">Absensi Saya</h2>
                    <p className="mb-6 text-gray-600 dark:text-gray-400">Isi kehadiran dan cek status tiap pertemuan langsung dari dashboard.</p>
                    {loadingAttendance ? (
                      <p className="text-gray-600 dark:text-gray-400">Memuat sesi absensi...</p>
                    ) : attendanceHistory.length === 0 ? (
                      <p className="text-gray-600 dark:text-gray-400">Belum ada sesi absensi yang tersedia.</p>
                    ) : (
                      <div className="space-y-4">
                        {attendanceHistory.map(({ session, attendance }) => {
                          const selectedChoice = attendanceChoices[session.id] || 'hadir';
                          const deadlinePassed = isDeadlinePassed(session.deadline);
                          const alreadySubmitted = Boolean(attendance);

                          return (
                            <article key={session.id} className="rounded-2xl bg-gradient-to-r from-white to-gray-50 dark:from-gray-700 dark:to-gray-600 shadow-lg border border-white/20 dark:border-gray-600/20 p-5">
                              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div>
                                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{session.title}</h3>
                                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Pertemuan: {formatAttendanceDate(session.date)}</p>
                                  <p className="text-sm text-gray-600 dark:text-gray-300">Deadline: {formatAttendanceDate(session.deadline)}</p>
                                </div>
                                <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${getAttendanceBadgeClass(attendance?.status)}`}>
                                  {alreadySubmitted ? getAttendanceLabel(attendance?.status) : deadlinePassed ? 'Tidak Hadir' : 'Belum Absen'}
                                </span>
                              </div>

                              {alreadySubmitted ? (
                                <div className="mt-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 text-sm text-blue-700 dark:text-blue-300">
                                  <p>Status absensi Anda: <strong>{getAttendanceLabel(attendance?.status)}</strong></p>
                                  <p className="mt-1">Alasan izin: {attendance?.reason || '-'}</p>
                                </div>
                              ) : deadlinePassed ? (
                                <div className="mt-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 p-4 text-sm text-rose-700 dark:text-rose-300">
                                  Deadline sudah lewat. Status absensi tercatat sebagai tidak hadir.
                                </div>
                              ) : (
                                <div className="mt-4 grid gap-4">
                                  <div>
                                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Status Kehadiran</label>
                                    <select
                                      value={selectedChoice}
                                      onChange={(e) => setAttendanceChoices((prev) => ({ ...prev, [session.id]: e.target.value as 'hadir' | 'izin' }))}
                                      className={inputClass}
                                    >
                                      <option value="hadir">Hadir</option>
                                      <option value="izin">Izin</option>
                                    </select>
                                  </div>

                                  {selectedChoice === 'izin' && (
                                    <div>
                                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Alasan Izin</label>
                                      <textarea
                                        rows={3}
                                        value={attendanceReasons[session.id] || ''}
                                        onChange={(e) => setAttendanceReasons((prev) => ({ ...prev, [session.id]: e.target.value }))}
                                        placeholder="Tulis alasan izin"
                                        className={`${inputClass} resize-none`}
                                      />
                                    </div>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleSubmitAttendance(session.id)}
                                    disabled={attendanceSavingId === session.id}
                                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg hover:shadow-xl"
                                  >
                                    {attendanceSavingId === session.id ? 'Menyimpan...' : 'Kirim Absensi'}
                                  </button>
                                </div>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <section className={`${cardClass} p-6 md:p-8`}>
                    <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">Riwayat Absensi</h2>
                    {loadingAttendance ? (
                      <p className="text-gray-600 dark:text-gray-400">Memuat riwayat absensi...</p>
                    ) : attendanceHistory.length === 0 ? (
                      <p className="text-gray-600 dark:text-gray-400">Belum ada riwayat absensi.</p>
                    ) : (
                      <div className="space-y-3">
                        {attendanceHistory.map(({ session, attendance }) => (
                          <div key={`history-${session.id}`} className="rounded-xl bg-white/70 dark:bg-gray-700/60 px-4 py-4 border border-white/30 dark:border-gray-600/30">
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                              <div>
                                <div className="font-semibold text-gray-900 dark:text-white">{session.title}</div>
                                <div className="text-sm text-gray-600 dark:text-gray-300">{formatAttendanceDate(session.date)}</div>
                              </div>
                              <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${getAttendanceBadgeClass(attendance?.status)}`}>
                                {getAttendanceLabel(attendance?.status)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          )}

          {activeTab === 'chatbot' && (
            <section className={`${cardClass} p-6 md:p-8`}>
              <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">AI Chatbot</h2>
              <p className="mb-6 text-gray-600 dark:text-gray-400">Panel chatbot sekarang memakai bahasa visual yang sama dengan form login dan register.</p>
              <form onSubmit={handleChatBot} className="grid gap-4">
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} placeholder="Tanyakan sesuatu pada AI" className={`${inputClass} resize-none`} />
                <button disabled={chatLoading} className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg hover:shadow-xl">{chatLoading ? 'Menghubungi AI...' : 'Kirim ke AI'}</button>
              </form>
              <div className="mt-4 rounded-2xl bg-white/70 dark:bg-gray-700/40 border border-white/30 dark:border-gray-600/30 p-4 whitespace-pre-wrap text-gray-700 dark:text-gray-200">{response || 'Balasan AI akan muncul di sini.'}</div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
