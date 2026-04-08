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

interface QuizQuestionRecord {
  question?: string;
  options?: string[];
  correctAnswer?: string;
}

export default function DosenPage() {
  const [user, setUser] = useState<User | null>(null);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
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
        if (firestoreData.role !== 'dosen') {
          router.push('/login');
          return;
        }

        setUser({
          uid: userData.uid,
          email: userData.email,
          role: firestoreData.role,
        });
        await loadQuestions();
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
