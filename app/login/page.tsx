'use client';

import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useRouter } from 'next/navigation';

type UserRole = 'admin' | 'dosen' | 'mahasiswa';

interface UserRecord {
  uid: string;
  email: string | null;
  role: UserRole;
  createdAt: Timestamp;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Email dan password harus diisi.');
      return;
    }

    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);

      // Cek apakah email di-whitelist sebagai admin
      let isAdminWhitelisted = false;
      if (user.email) {
        try {
          const adminEmailRef = doc(db, 'adminEmails', user.email.toLowerCase());
          const adminEmailDoc = await getDoc(adminEmailRef);
          isAdminWhitelisted = adminEmailDoc.exists();
        } catch (adminWhitelistError) {
          console.warn('Admin whitelist check failed, continue as non-admin:', adminWhitelistError);
        }
      }

      let userData: UserRecord;
      if (!userDoc.exists()) {
        // Buat record awal di Firestore untuk user existing yang belum tersimpan
        userData = {
          uid: user.uid,
          email: user.email,
          role: isAdminWhitelisted ? 'admin' : 'mahasiswa',
          createdAt: Timestamp.now(),
        };
        await setDoc(userRef, userData);
      } else {
        userData = userDoc.data() as UserRecord;
        // Update role jika ada di admin whitelist
        if (isAdminWhitelisted && userData.role !== 'admin') {
          await updateDoc(userRef, { role: 'admin' });
          userData = { ...userData, role: 'admin' };
        }
      }

      localStorage.setItem('user', JSON.stringify({
        uid: user.uid,
        email: user.email,
        role: userData.role,
      }));

      if (userData.role === 'admin' || userData.role === 'dosen' || userData.role === 'mahasiswa') {
        router.push('/dashboard');
      } else {
        throw new Error('Role tidak valid');
      }
    } catch (err: unknown) {
      let message = 'Terjadi kesalahan saat login.';
      const errorCode = typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code)
        : '';
      const errorMessage = typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message?: unknown }).message)
        : '';

      if (errorMessage) {
        message = errorMessage;
      }

      if (
        errorCode === 'auth/invalid-credential' ||
        errorCode === 'auth/invalid-login-credentials' ||
        errorCode === 'auth/user-not-found' ||
        errorCode === 'auth/wrong-password'
      ) {
        message = 'Email atau password tidak valid.';
      } else if (errorCode === 'auth/configuration-not-found') {
        message = 'Firebase Authentication belum diaktifkan';
      } else if (errorCode === 'auth/invalid-api-key') {
        message = 'Konfigurasi Firebase tidak valid. Periksa NEXT_PUBLIC_FIREBASE_API_KEY.';
      } else if (errorCode === 'auth/app-not-authorized') {
        message = 'Aplikasi ini belum diotorisasi di Firebase Authentication.';
      } else if (errorCode === 'auth/network-request-failed') {
        message = 'Gagal terhubung ke Firebase. Periksa koneksi internet dan konfigurasi project.';
      } else if (errorCode === 'permission-denied') {
        message = 'Akses Firestore ditolak. Pastikan firestore.rules terbaru sudah di-deploy.';
      }

      const handledAuthErrors = new Set([
        'auth/invalid-credential',
        'auth/invalid-login-credentials',
        'auth/user-not-found',
        'auth/wrong-password',
        'auth/configuration-not-found',
        'auth/invalid-api-key',
        'auth/app-not-authorized',
        'auth/network-request-failed',
        'permission-denied',
      ]);

      if (!handledAuthErrors.has(errorCode)) {
        console.error('Login error:', err);
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-blue-900 dark:to-purple-900 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-br from-indigo-400/20 to-pink-400/20 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl mb-4 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Selamat Datang Kembali
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Masuk untuk melanjutkan perjalanan belajar Anda
          </p>
        </div>

        {/* Login Form */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/20 p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                  </svg>
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="Masukkan email Anda"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  placeholder="Masukkan password Anda"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg hover:shadow-xl"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Memproses...
                </div>
              ) : (
                'Masuk Sekarang'
              )}
            </button>
          </form>

          {/* Register Link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Belum punya akun?{' '}
              <a
                href="/register"
                className="font-semibold text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 transition-colors duration-200"
              >
                Daftar di sini
              </a>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Dengan masuk, Anda menyetujui{' '}
            <a href="#" className="text-blue-600 hover:text-blue-500 dark:text-blue-400">
              Syarat & Ketentuan
            </a>{' '}
            kami
          </p>
        </div>
      </div>
    </div>
  );
}
