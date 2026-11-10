export const PROOF_MAX_BYTES = 10 * 1024 * 1024;

export function isValidGuestEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Philippine mobile: 09XXXXXXXXX, 639XXXXXXXXX, or +639XXXXXXXXX. */
export function normalizePhMobile(value: string): string | null {
  const compact = value.trim().replace(/[\s()-]/g, '');
  if (/^09\d{9}$/.test(compact)) return compact;
  if (/^\+639\d{9}$/.test(compact)) return `0${compact.slice(3)}`;
  if (/^639\d{9}$/.test(compact)) return `0${compact.slice(2)}`;
  return null;
}

export function proofFileProblem(file: { name: string; size: number; type?: string }): string | null {
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  if (name.endsWith('.heic') || name.endsWith('.heif') || type === 'image/heic' || type === 'image/heif') {
    return 'HEIC photos are not accepted. Please upload a JPG, PNG, or PDF.';
  }
  if (file.size > PROOF_MAX_BYTES) return 'Payment proof must be 10 MB or smaller.';
  if (file.size <= 0) return 'Payment proof upload is required.';
  return null;
}
