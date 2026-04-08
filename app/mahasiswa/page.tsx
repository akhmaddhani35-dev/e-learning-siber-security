'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, addDoc, getDocs, Timestamp, doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';

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

export default function MahasiswaPage() {
  const [user, setUser] = useState<User | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<QuizResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const router = useRouter();

  useEffect(() => {
    const verifyAndSetUser = async () => {
      try {
        const storedUser = localStorage.getItem('user');
        if (!storedUser) {
          router.push('/login');
          return;
        }

        const userData = JSON.parse(storedUser) as User;
        // Verify role dari Firestore
        const userRef = doc(db, 'users', userData.uid);
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
          uid: userData.uid,
          email: userData.email,
          role: firestoreData.role,
        };
        setUser(verifiedUser);
        await loadQuestions();
        await loadResults(userData.uid);
      } catch (err) {
        console.error('Error verifying user:', err);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    verifyAndSetUser();
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

  const handleLogout = () => {
    localStorage.removeItem('user');
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Riwayat Kuis</h2>
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
      </div>
    </div>
  );
}
