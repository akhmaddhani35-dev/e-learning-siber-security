'use client';

import { useState } from 'react';

export default function MhsSetupPage() {
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [secretKey, setSecretKey] = useState('');

  const handleSetAdmin = async () => {
    try {
      setLoading(true);
      setStatus('Mengatur admin...');

      const response = await fetch('/api/set-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'dhani1@gmail.com',
          secret: secretKey,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus(`ERROR: ${data.error || 'Gagal mengatur admin'}`);
        return;
      }

      setStatus(`SUCCESS: ${data.message}`);
    } catch (error) {
      console.error('Error:', error);
      setStatus(`ERROR: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Setup Admin</h1>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          Setup dhani1@gmail.com sebagai admin di Firebase.
        </p>

        <div className="mb-4">
          <label className="block text-gray-700 dark:text-gray-300 font-medium mb-2">
            Secret Key
          </label>
          <input
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Masukkan secret key"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Gunakan nilai ADMIN_SETUP_SECRET dari server
          </p>
        </div>

        <button
          onClick={handleSetAdmin}
          disabled={loading}
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 disabled:opacity-60 transition-all duration-200 mb-4"
        >
          {loading ? 'Processing...' : 'Set Admin dhani1@gmail.com'}
        </button>

        {status && (
          <div className="mt-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
            <p
              className={`text-sm ${
                status.includes('SUCCESS:')
                  ? 'text-green-700 dark:text-green-300'
                  : status.includes('ERROR:')
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-blue-700 dark:text-blue-300'
              }`}
            >
              {status}
            </p>
          </div>
        )}

        <div className="mt-6 p-4 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm text-gray-600 dark:text-gray-300">
          <p className="font-semibold mb-2">Catatan:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Pastikan dhani1@gmail.com sudah terdaftar di Firebase Auth</li>
            <li>Setelah setup, login ulang dengan akun tersebut</li>
            <li>Anda akan melihat Dashboard Admin setelah login</li>
            <li>Secret key ada di environment variable ADMIN_SETUP_SECRET (server only)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
