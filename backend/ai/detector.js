import { explainIndicators } from './explanation.js';

const shorteners = ['bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly', 'is.gd', 'buff.ly'];
const sensitiveWords = [
  'password',
  'otp',
  'pin',
  'kode verifikasi',
  'credential',
  'kode otp',
  'kode akses',
  'data login',
  'informasi akun',
  'nomor kartu',
];
const urgencyWords = [
  'urgent',
  'segera',
  'diblokir',
  'bermasalah',
  'sekarang',
  'cepat',
  'hari ini',
  'secepatnya',
  'terakhir',
  'warning',
  'peringatan',
];
const urgencyPatterns = [
  /\burgent\b/i,
  /\bimmediately\b/i,
  /\bsegera\b/i,
  /\bsekarang\b/i,
  /\bwithin\s?24\s?hours\b/i,
  /\bcepat\b/i,
];
const blockedPatterns = [
  /\bakun.*diblokir\b/i,
  /\bakun.*bermasalah\b/i,
  /\bakun.*ditangguhkan\b/i,
  /\bakun.*dinonaktifkan\b/i,
  /\baccount.*suspend/i,
  /\baccount.*blocked/i,
  /\bverifikasi sekarang\b/i,
];
const sensitivePatterns = [
  /\bpassword\b/i,
  /\botp\b/i,
  /\bpin\b/i,
  /\bkode verifikasi\b/i,
  /\bnomor kartu\b/i,
  /\bcredential\b/i,
];
const rewardPatterns = [/\bhadiah\b/i, /\bprize\b/i, /\bbonus\b/i, /\breward\b/i];
const attachmentPatterns = [/\blampiran\b/i, /\battachment\b/i, /\.(zip|exe|scr|html)\b/i];
const fakeBrandPatterns = [
  /\bpaypa[l1i]\b/i,
  /\bmicr0soft\b/i,
  /\bg00gle\b/i,
  /\bamaz0n\b/i,
  /\bfaceb00k\b/i,
];
const suspiciousRequestPatterns = [
  /\bklik link\b/i,
  /\blogin sekarang\b/i,
  /\bverifikasi akun\b/i,
  /\bkonfirmasi akun\b/i,
  /\bperbarui data\b/i,
  /\bupdate data\b/i,
  /\bisi formulir\b/i,
];

function extractUrls(text) {
  return text.match(/https?:\/\/[^\s]+/gi) || [];
}

function extractDomains(urls) {
  return urls
    .map((url) => {
      try {
        return new URL(url).hostname.toLowerCase();
      } catch {
        return '';
      }
    })
    .filter(Boolean);
}

function hasSuspiciousDomain(domains) {
  return domains.some((domain) => {
    if (shorteners.some((item) => domain.includes(item))) return true;
    if (domain.includes('@')) return true;
    if (/(secure|login|verify|update).*(account|bank|paypal|google|microsoft)/i.test(domain)) return true;
    if (/(paypa|micros0ft|g00gle|amaz0n|faceb00k)/i.test(domain)) return true;
    if ((domain.match(/-/g) || []).length >= 2) return true;
    return false;
  });
}

export function classifyEmail(emailText = '') {
  const text = String(emailText || '').trim();
  const indicators = [];
  const urls = extractUrls(text);
  const domains = extractDomains(urls);
  let score = 0;

  const addIndicator = (indicator, weight = 0) => {
    if (!indicators.includes(indicator)) {
      indicators.push(indicator);
      score += weight;
    }
  };

  if (domains.some((domain) => shorteners.some((item) => domain.includes(item)))) {
    addIndicator('shortener_url', 2);
  }

  if (
    urgencyPatterns.some((pattern) => pattern.test(text)) ||
    urgencyWords.some((word) => text.toLowerCase().includes(word))
  ) {
    addIndicator('urgency_words', 1);
  }

  if (blockedPatterns.some((pattern) => pattern.test(text))) {
    addIndicator('blocked_account_claim', 1);
  }

  if (
    sensitivePatterns.some((pattern) => pattern.test(text)) ||
    sensitiveWords.some((word) => text.toLowerCase().includes(word))
  ) {
    addIndicator('sensitive_request', 2);
  }

  if (rewardPatterns.some((pattern) => pattern.test(text))) {
    addIndicator('reward_or_prize', 1);
  }

  if (attachmentPatterns.some((pattern) => pattern.test(text))) {
    addIndicator('attachment_pressure', 1);
  }

  if (fakeBrandPatterns.some((pattern) => pattern.test(text))) {
    addIndicator('typo_branding', 1);
  }

  if (suspiciousRequestPatterns.some((pattern) => pattern.test(text))) {
    addIndicator('permintaan mencurigakan', 1);
  }

  if (hasSuspiciousDomain(domains)) {
    addIndicator('suspicious_domain', 2);
  }

  if (urls.some((url) => /@|%40/.test(url) || /login|verify|secure|update/i.test(url))) {
    addIndicator('suspicious_link_text', 2);
  }

  const hasSensitiveRequest = indicators.includes('sensitive_request');
  const indicatorCount = indicators.length;
  const phishing = score >= 2 || indicatorCount >= 2 || hasSensitiveRequest;

  if (phishing && indicators.length < 3) {
    addIndicator('pola social engineering', 0);
    if (indicators.length < 3) {
      addIndicator('permintaan mencurigakan', 0);
    }
  }

  const confidence = phishing
    ? Math.min(60 + score * 12 + indicators.length * 4, 99)
    : Math.max(35 + score * 5 + indicators.length * 3, 35);

  const explanation = phishing
    ? explainIndicators(indicators)
    : 'Email ini cenderung aman karena tidak ditemukan kombinasi indikator phishing yang kuat. Tetap lakukan verifikasi pengirim dan tautan jika diperlukan.';

  return {
    label: phishing ? 'phishing' : 'legit',
    confidence: Number(confidence.toFixed(0)),
    indicators,
    explanation,
  };
}
