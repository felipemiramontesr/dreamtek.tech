import crypto from 'node:crypto';

const RFC4648_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BACKUP_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Sin 0, O, 1, I, L

export interface VerifyTotpResult {
  valid: boolean;
  matchedStep: bigint | null;
  reason?: 'INVALID_FORMAT' | 'CODE_REPLAYED' | 'INVALID_CODE';
}

/**
 * Encodes buffer to RFC 4648 Base32 string without padding '='.
 */
export function encodeBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += RFC4648_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += RFC4648_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes RFC 4648 Base32 string to Buffer.
 */
export function decodeBase32(base32Str: string): Buffer {
  const cleaned = String(base32Str || '')
    .toUpperCase()
    .replace(/[\s\-=]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    const index = RFC4648_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid Base32 character: ${char}`);
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates fresh 160-bit (20 bytes) secret in Base32 and URI for Authenticator apps.
 */
export function generateTotpSecret(
  accountEmail = 'admin@dreamtek.tech',
  issuer = process.env.TOTP_ISSUER || 'Dreamtek',
): { secretBytes: Buffer; secretBase32: string; otpauthUri: string } {
  const secretBytes = crypto.randomBytes(20);
  const secretBase32 = encodeBase32(secretBytes);
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountEmail);

  const otpauthUri = `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secretBase32}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;

  return { secretBytes, secretBase32, otpauthUri };
}

/**
 * Computes 6-digit TOTP code for a given 30-second step (RFC 4226 / RFC 6238).
 */
export function computeTotpCode(
  secretBase32: string,
  step: bigint | number,
  digits = 6,
): string {
  const key = decodeBase32(secretBase32);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(step));

  const hmac = crypto.createHmac('sha1', key);
  hmac.update(counterBuf);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binary % 10 ** digits;
  return otp.toString().padStart(digits, '0');
}

/**
 * Verifies candidate code against secret, respecting drift window (+/-1) and anti-replay step.
 */
export function verifyTotpCode(
  secretBase32: string,
  candidateCode: string,
  lastUsedStep?: bigint | number | string | null,
  nowSeconds?: number,
): VerifyTotpResult {
  const normalized = String(candidateCode || '').trim();
  if (!/^\d{6}$/.test(normalized)) {
    return { valid: false, matchedStep: null, reason: 'INVALID_FORMAT' };
  }

  const currentSeconds = nowSeconds !== undefined ? nowSeconds : Date.now() / 1000;
  const currentStep = BigInt(Math.floor(currentSeconds / 30));
  const candidateBuf = Buffer.from(normalized, 'utf8');

  let matched: bigint | null = null;
  for (const offset of [-1, 0, 1]) {
    const step = currentStep + BigInt(offset);
    const expected = computeTotpCode(secretBase32, step);
    const expectedBuf = Buffer.from(expected, 'utf8');

    if (
      candidateBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(candidateBuf, expectedBuf)
    ) {
      matched = step;
      break;
    }
  }

  if (matched === null) {
    return { valid: false, matchedStep: null, reason: 'INVALID_CODE' };
  }

  if (lastUsedStep !== undefined && lastUsedStep !== null) {
    const lastStepBigInt = BigInt(lastUsedStep);
    if (matched <= lastStepBigInt) {
      return { valid: false, matchedStep: null, reason: 'CODE_REPLAYED' };
    }
  }

  return { valid: true, matchedStep: matched };
}

/**
 * Computes cryptographically salted hash for backup code using native node:crypto (Zero-Dep).
 */
export function hashBackupCode(plainCode: string): string {
  const normalized = String(plainCode || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return crypto.createHash('sha256').update(`dtk_mfa_salt_${normalized}`).digest('hex');
}

/**
 * Verifies candidate backup code against stored hash in constant time.
 */
export function verifyBackupCode(plainCode: string, storedHash: string): boolean {
  if (!plainCode || !storedHash) return false;
  const candidateHash = hashBackupCode(plainCode);
  const a = Buffer.from(candidateHash, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Generates 8 one-time backup codes formatted as XXXXX-XXXXX.
 */
export function generateBackupCodes(count = 8): {
  plainCodes: string[];
  hashedCodes: string[];
} {
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    const bytes = crypto.randomBytes(10);
    let codeStr = '';
    for (let j = 0; j < 10; j++) {
      codeStr += BACKUP_ALPHABET[bytes[j] % BACKUP_ALPHABET.length];
    }
    const formatted = `${codeStr.slice(0, 5)}-${codeStr.slice(5, 10)}`;
    plainCodes.push(formatted);
    hashedCodes.push(hashBackupCode(formatted));
  }

  return { plainCodes, hashedCodes };
}
