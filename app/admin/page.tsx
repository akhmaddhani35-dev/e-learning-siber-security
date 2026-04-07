'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface User {
  uid: string;
  email: string;
  role: string;
}

export default function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
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

        const userData = JSON.parse(storedUser);
        // Verify role dari Firestore (lebih aman)
        const userRef = doc(db, 'users', userData.uid);
        const userDoc = await getDoc(userRef);
        
        if (!userDoc.exists()) {
          router.push('/login');
          return;
        }

        const firestoreData = userDoc.data();
        if (firestoreData.role !== 'admin') {
          router.push('/login');
          return;
        }

        setUser({
          uid: userData.uid,
          email: userData.email,
          role: firestoreData.role,
        });
      } catch (err) {
        console.error('Error verifying user:', err);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    verifyAndSetUser();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    router.push('/login');
  };

  if (loading || !user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard Admin</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2">
              Halo, <strong>{user.email}</strong> — kelola data dan sistem AI secara langsung.
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
          >
            Logout
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Kelola Dataset</h2>
            <p className="text-gray-600 dark:text-gray-300">Tambah/edit contoh email phishing dan aman.</p>
          </div>
          <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Kelola Rules AI</h2>
            <p className="text-gray-600 dark:text-gray-300">Input kata kunci/aturan untuk deteksi (NLP sederhana).</p>
          </div>
          <div className="rounded-3xl bg-white dark:bg-gray-800 p-8 shadow-xl border border-gray-200 dark:border-gray-700 md:col-span-2">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Manajemen User</h2>
            <p className="text-gray-600 dark:text-gray-300">Tambah atau hapus akun mahasiswa dan dosen.</p>
          </div>
        </div>
      </div>
    </div>
  );
}