export function normalizeDeadline(deadline: string): string {
  const value = deadline.trim();
  if (!value) {
    throw new Error('Deadline wajib diisi.');
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Format deadline tidak valid.');
  }

  if (parsed.getTime() <= Date.now()) {
    throw new Error('Deadline harus lebih besar dari waktu saat ini.');
  }

  return parsed.toISOString();
}

export function isDeadlinePassed(deadline?: string | null): boolean {
  if (!deadline) {
    return false;
  }

  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return Date.now() > parsed.getTime();
}

export function toDatetimeLocalValue(deadline?: string | null): string {
  if (!deadline) {
    return '';
  }

  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const offsetMs = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
}
