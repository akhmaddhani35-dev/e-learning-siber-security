export const explanationMap = {
  shortener_url: 'Email memakai link pemendek URL yang sering digunakan untuk menyamarkan tujuan asli tautan.',
  urgency_words: 'Email memakai kata-kata mendesak agar penerima panik dan segera bertindak tanpa memeriksa keaslian pesan.',
  blocked_account_claim: 'Email mengklaim akun akan diblokir atau dinonaktifkan untuk menekan penerima.',
  suspicious_domain: 'Terdapat domain yang terlihat tidak resmi, meniru brand, atau tidak sesuai layanan yang disebutkan.',
  typo_branding: 'Ada typo atau penulisan brand yang janggal, yang sering menjadi tanda pemalsuan.',
  sensitive_request: 'Email meminta data sensitif seperti password, OTP, PIN, atau kode verifikasi.',
  suspicious_link_text: 'Link atau teks URL tampak tidak cocok dengan layanan resmi yang dikenal.',
  reward_or_prize: 'Email menawarkan hadiah atau imbalan untuk memancing klik.',
  attachment_pressure: 'Email mendorong membuka lampiran atau file dengan alasan mendesak.',
};

export function explainIndicators(indicators = []) {
  if (!indicators.length) {
    return 'Tidak ditemukan indikator kuat yang mengarah ke phishing. Tetap periksa pengirim, tautan, dan konteks email.';
  }

  const reasons = indicators.map((key) => explanationMap[key]).filter(Boolean);

  return reasons.length
    ? `Email ini berbahaya karena ${reasons.join(' ')}`
    : 'Email ini terindikasi berbahaya karena memiliki beberapa pola umum phishing.';
}
