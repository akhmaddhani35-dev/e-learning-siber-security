'use client';

const materialsData = [
  {
    id: 1,
    icon: '🔒',
    title: 'Fundamentals of Cybersecurity',
    description: 'Pelajari dasar-dasar keamanan siber, termasuk konsep CIA Triad, ancaman umum, dan prinsip keamanan informasi.',
    topics: ['CIA Triad', 'Threat Types', 'Security Principles']
  },
  {
    id: 2,
    icon: '🔐',
    title: 'Cryptography & Encryption',
    description: 'Mengerti algoritma enkripsi, hashing, digital signatures, dan public key infrastructure (PKI).',
    topics: ['Symmetric Encryption', 'Asymmetric Encryption', 'Hashing', 'PKI']
  },
  {
    id: 3,
    icon: '🚨',
    title: 'Network Security',
    description: 'Proteksi jaringan dengan firewall, VPN, IDS/IPS, dan teknologi network security lainnya.',
    topics: ['Firewall', 'VPN', 'IDS/IPS', 'Network Segmentation']
  },
  {
    id: 4,
    icon: '🎯',
    title: 'Malware & Threats',
    description: 'Identifikasi dan analisis berbagai jenis malware, virus, worm, ransomware, dan ancaman cyber lainnya.',
    topics: ['Virus & Worms', 'Ransomware', 'Trojan', 'Spyware', 'Adware']
  },
  {
    id: 5,
    icon: '🔑',
    title: 'Access Control & Authentication',
    description: 'Implementasi authentication, authorization, dan access control untuk melindungi resources.',
    topics: ['Authentication', 'Authorization', 'MFA', 'Identity Management']
  },
  {
    id: 6,
    icon: '🕵️',
    title: 'Ethical Hacking & Penetration Testing',
    description: 'Teknik penetration testing legal untuk menemukan kerentanan sebelum attacker memanfaatkannya.',
    topics: ['Reconnaissance', 'Scanning', 'Exploitation', 'Reporting']
  },
  {
    id: 7,
    icon: '🛡️',
    title: 'Web Application Security',
    description: 'Keamanan aplikasi web terhadap OWASP Top 10, SQL Injection, XSS, CSRF, dan serangan lainnya.',
    topics: ['OWASP Top 10', 'SQL Injection', 'XSS', 'CSRF', 'Authentication Flaws']
  },
  {
    id: 8,
    icon: '📊',
    title: 'Incident Response & Forensics',
    description: 'Merencanakan dan melaksanakan incident response, serta investigasi forensik digital untuk insiden keamanan.',
    topics: ['Incident Handling', 'Digital Forensics', 'Evidence Preservation', 'Analysis']
  },
  {
    id: 9,
    icon: '⚙️',
    title: 'System & Application Hardening',
    description: 'Teknik hardening untuk sistem operasi dan aplikasi untuk meminimalkan permukaan serangan.',
    topics: ['OS Hardening', 'Application Hardening', 'Configuration', 'Patch Management']
  },
  {
    id: 10,
    icon: '🌐',
    title: 'Cloud Security',
    description: 'Keamanan infrastruktur cloud, kontrol akses, enkripsi data, dan best practices cloud security.',
    topics: ['Cloud Architecture', 'Access Control', 'Data Protection', 'Compliance']
  },
  {
    id: 11,
    icon: '🤖',
    title: 'AI & Machine Learning in Security',
    description: 'Implementasi AI dan ML untuk deteksi ancaman, anomaly detection, dan predictive security.',
    topics: ['Anomaly Detection', 'Threat Prediction', 'Automation', 'AI-Driven Security']
  },
  {
    id: 12,
    icon: '📋',
    title: 'Compliance & Governance',
    description: 'Standar keamanan industri seperti ISO 27001, GDPR, HIPAA, PCI-DSS, dan framework keamanan lainnya.',
    topics: ['ISO 27001', 'GDPR', 'HIPAA', 'PCI-DSS', 'NIST Framework']
  }
];

export default function MaterialsList() {
  return (
    <section id="materials" className="py-24 px-6 bg-gray-50 dark:bg-gray-800">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Materi Pembelajaran
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            Jelajahi koleksi materi cyber security komprehensif kami yang disusun oleh para ahli industri. Dari dasar hingga advanced topics.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {materialsData.map((material) => (
            <div
              key={material.id}
              className="group bg-white dark:bg-gray-700 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 overflow-hidden"
            >
              <div className="h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>
              <div className="p-6">
                <div className="text-5xl mb-4">{material.icon}</div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 group-hover:text-blue-600 transition-colors duration-200">
                  {material.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm mb-4 leading-relaxed">
                  {material.description}
                </p>
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Topik yang dibahas:</p>
                  <div className="flex flex-wrap gap-2">
                    {material.topics.map((topic, idx) => (
                      <span
                        key={idx}
                        className="inline-block bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded text-xs font-medium"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
                <button className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-2 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all duration-200 transform hover:scale-105 font-semibold text-sm">
                  <a href="/register">Belajar Sekarang</a>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
