export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <header className="fixed top-0 z-50 w-full bg-white/90 shadow-lg backdrop-blur-md dark:bg-gray-900/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-purple-600">
              <span className="text-lg font-bold text-white">CS</span>
            </div>
            <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-2xl font-bold text-transparent">
              CyberSec Learn
            </h1>
          </div>
          <div className="flex space-x-3">
            <button className="hidden rounded-lg border border-blue-600 px-4 py-2 text-blue-600 transition-colors duration-200 hover:bg-blue-50 dark:hover:bg-gray-800 md:block">
              <a href="/login">Masuk</a>
            </button>
            <button className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-white shadow-lg transition-all duration-200 hover:from-blue-700 hover:to-purple-700">
              <a href="/login">Mulai</a>
            </button>
          </div>
        </div>
      </header>

      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-32 pt-20 text-center">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <span className="mb-4 inline-block rounded-full bg-blue-100 px-4 py-2 text-sm font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              Platform E-Learning Terdepan
            </span>
            <h1 className="mb-6 text-5xl font-extrabold leading-tight text-gray-900 dark:text-white md:text-7xl">
              Bangun Kompetensi{' '}
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Cyber Security
              </span>{' '}
              dalam Satu Platform
            </h1>
            <p className="mx-auto mb-10 max-w-3xl text-xl leading-relaxed text-gray-600 dark:text-gray-300 md:text-2xl">
              CyberSec Learn membantu proses belajar cyber security menjadi lebih terstruktur melalui materi, quiz,
              evaluasi hasil, dan dukungan fitur AI yang mudah diakses.
            </p>
          </div>

          <div className="flex justify-center">
            <button className="transform rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-10 py-4 text-lg font-semibold text-white shadow-xl transition-all duration-300 hover:-translate-y-1 hover:from-blue-700 hover:to-purple-700 hover:shadow-2xl">
              <a href="/login">Masuk ke Platform</a>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
