import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM recommended

/**
 * Derives the 32-byte (256-bit) encryption key for the handover vault.
 * Condition C-046.1: Fail-closed if HANDOVER_VAULT_KEY is missing in production.
 */
export function getHandoverVaultKey(): Buffer {
  const secret = process.env.HANDOVER_VAULT_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FATAL SECURITY ERROR: HANDOVER_VAULT_KEY environment variable is missing in production.',
      );
    }
    // Fallback key for local dev and test runs
    return crypto.createHash('sha256').update('dreamtek_dev_handover_vault_key_2026').digest();
  }
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts sensitive handover credentials using AES-256-GCM.
 * Output format: iv_hex:tag_hex:ciphertext_hex
 */
export function encryptVaultCredentials(plainText: string): string {
  if (!plainText) return plainText;
  const key = getHandoverVaultKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts handover credentials using AES-256-GCM.
 * Fails closed if tampered or invalid.
 */
export function decryptVaultCredentials(encryptedString: string): string {
  if (!encryptedString) return encryptedString;
  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted vault credentials format.');
  }

  const [ivHex, tagHex, cipherHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const key = getHandoverVaultKey();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export interface CanonicalCertificatePayment {
  id: number;
  amount_cents: number;
  currency: string;
}

export interface CanonicalCertificateData {
  project_id: number;
  status: string;
  pending_balance_cents: number;
  paid_payments: CanonicalCertificatePayment[];
}

export interface SettlementCertificateResult {
  canonical_data: CanonicalCertificateData;
  certificate_sha256: string;
}

/**
 * Computes a deterministic canonical payload and its immutable SHA-256 hash.
 * Condition C-046.2: Stable canonical payload, strictly excluding download_count or download timestamps.
 */
export function generateCanonicalCertificate(
  project: { id: number | string; status: string; pending_balance_cents: number },
  paidPayments: Array<{ id: number; amount_cents: number; currency: string }>,
): SettlementCertificateResult {
  const sortedPayments: CanonicalCertificatePayment[] = (paidPayments || [])
    .map((p) => ({
      id: Number(p.id),
      amount_cents: Number(p.amount_cents),
      currency: String(p.currency).toUpperCase(),
    }))
    .sort((a, b) => a.id - b.id);

  const canonical_data: CanonicalCertificateData = {
    project_id: Number(project.id),
    status: String(project.status),
    pending_balance_cents: Number(project.pending_balance_cents),
    paid_payments: sortedPayments,
  };

  const serialized = JSON.stringify(canonical_data);
  const certificate_sha256 = crypto.createHash('sha256').update(serialized).digest('hex');

  return {
    canonical_data,
    certificate_sha256,
  };
}
