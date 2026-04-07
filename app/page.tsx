export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">CS</span>
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              CyberSec Learn
            </h1>
          </div>
          <nav className="hidden md:flex space-x-8">
            <a href="#about" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 transition-colors duration-200">Tentang</a>
            <a href="#contact" className="text-gray-700 dark:text-gray-300 hover:text-blue-600 transition-colors duration-200">Kontak</a>
          </nav>
          <div className="flex space-x-3">
            <button className="hidden md:block border border-blue-600 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-800 transition-colors duration-200">
              <a href="/login">Masuk</a>
            </button>
            <button className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 shadow-lg">
              <a href="/register">Daftar</a>
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="pt-20 flex flex-col items-center justify-center text-center py-32 px-6 min-h-screen">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <span className="inline-block bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-4 py-2 rounded-full text-sm font-medium mb-4">
              🚀 Platform E-Learning Terdepan
            </span>
            <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 dark:text-white mb-6 leading-tight">
              Bangun Kompetensi <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Cyber Security</span> dalam Satu Platform
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-10 max-w-3xl mx-auto leading-relaxed">
              CyberSec Learn membantu proses belajar cyber security menjadi lebih terstruktur melalui materi, quiz, evaluasi hasil, dan dukungan fitur AI yang mudah diakses.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <button className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-10 py-4 rounded-xl text-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:-translate-y-1">
              <a href="/register">Mulai Belajar Gratis</a>
            </button>
            <button className="border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-10 py-4 rounded-xl text-lg font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-300">
              <a href="#about">Pelajari Lebih Lanjut</a>
            </button>
          </div>

        </div>
      </main>

      {/* Features Section */}
      <section id="about" className="py-24 px-6 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
              Mengapa Memilih CyberSec Learn?
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              CyberSec Learn dirancang sebagai platform e-learning cyber security yang mendukung pembelajaran terarah, pengelolaan materi oleh pengajar, serta evaluasi hasil belajar mahasiswa dalam satu sistem.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="group p-8 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-800 dark:to-gray-700 rounded-2xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <span className="text-white text-2xl">🤖</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">AI Threat Simulation</h3>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                Fitur simulasi dan bantuan AI membantu proses belajar menjadi lebih interaktif saat memahami ancaman, pola serangan, dan respons keamanan dasar.
              </p>
            </div>

            <div className="group p-8 bg-gradient-to-br from-purple-50 to-pink-100 dark:from-gray-800 dark:to-gray-700 rounded-2xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2">
              <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <span className="text-white text-2xl">🎓</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Materi Pembelajaran</h3>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                Materi disusun sebagai modul pembelajaran digital yang mudah diakses, lengkap dengan konten teori, latihan, dan evaluasi quiz.
              </p>
            </div>

            <div className="group p-8 bg-gradient-to-br from-green-50 to-teal-100 dark:from-gray-800 dark:to-gray-700 rounded-2xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2">
              <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-green-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <span className="text-white text-2xl">🏆</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Monitoring Hasil Belajar</h3>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                Setiap pengguna dapat memantau progres belajar, melihat hasil quiz, dan menggunakan dashboard sesuai peran untuk mendukung proses pembelajaran.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Siap Mengamankan Dunia Digital?
          </h2>
          <p className="text-xl mb-10 opacity-90">
            Bergabunglah dengan ribuan profesional yang telah mempercayai CyberSec Learn untuk pendidikan cyber security mereka.
          </p>
          <button className="bg-white text-blue-600 px-10 py-4 rounded-xl text-lg font-semibold hover:bg-gray-100 transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:-translate-y-1">
            <a href="/register">Mulai Perjalanan Anda Sekarang</a>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="py-12 px-6 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="text-xl font-bold mb-4">CyberSec Learn</h3>
              <p className="text-gray-400">
                Platform e-learning terdepan untuk pendidikan cyber security dengan teknologi AI.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Platform</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Materi</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Sertifikasi</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Bantuan</a></li>
                <li><a href="#" className="hover:text-white transition-colors">FAQ</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Kontak</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Ikuti Kami</h4>
              <div className="flex space-x-4">
                <a href="#" className="text-gray-400 hover:text-white transition-colors">📘</a>
                <a href="#" className="text-gray-400 hover:text-white transition-colors">🐦</a>
                <a href="#" className="text-gray-400 hover:text-white transition-colors">📧</a>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-gray-400">
            <p>&copy; 2026 CyberSec Learn. Semua hak dilindungi.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
