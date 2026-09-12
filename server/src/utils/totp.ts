import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for AES-GCM
const RFC4648_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Derives the 32-byte (256-bit) encryption key for the MFA TOTP vault.
 * Condition C-047.2: Fail-closed if MFA_VAULT_KEY is missing in production.
 * Prohibits reuse of HANDOVER_VAULT_KEY or JWT_SECRET.
 */
export function getMfaVaultKey(): Buffer {
  const secret = process.env.MFA_VAULT_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FATAL SECURITY ERROR: MFA_VAULT_KEY environment variable is missing in production.',
      );
    }
    // Safe fallback key for local dev and automated test suites
    return crypto.createHash('sha256').update('dreamtek_dev_mfa_vault_key_2026').digest();
  }
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a Base32 TOTP secret using AES-256-GCM.
 * Output format: iv_hex:tag_hex:ciphertext_hex
 */
export function encryptTotpSecret(plainSecret: string): string {
  if (!plainSecret) return plainSecret;
  const key = getMfaVaultKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plainSecret, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a Base32 TOTP secret using AES-256-GCM.
 * Fails closed if tampered or improperly formatted.
 */
export function decryptTotpSecret(encryptedString: string): string {
  if (!encryptedString) return encryptedString;
  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted TOTP secret format.');
  }

  const [ivHex, tagHex, cipherHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const key = getMfaVaultKey();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Encodes a buffer to RFC 4648 Base32 string (without padding).
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
 * Decodes an RFC 4648 Base32 string to Buffer.
 * Ignores whitespace, hyphens and padding '=' characters.
 */
export function decodeBase32(base32Str: string): Buffer {
  const cleaned = base32Str.toUpperCase().replace(/[\s\-=]/g, '');
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
 * Generates a fresh 160-bit (20-byte) cryptographically secure Base32 TOTP secret
 * and constructs the standard otpauth:// URI (RFC 6238).
 */
export function generateTotpSecret(
  accountEmail: string,
  issuer = 'Dreamtek',
): { secretBase32: string; otpauthUrl: string } {
  const randomBytes = crypto.randomBytes(20);
  const secretBase32 = encodeBase32(randomBytes);
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountEmail);

  const otpauthUrl = `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secretBase32}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;

  return { secretBase32, otpauthUrl };
}

/**
 * Computes a 6-digit TOTP code for a given timestep according to RFC 6238 / RFC 4226.
 */
export function computeTotpCode(secretBase32: string, timestep: bigint | number, digits = 6): string {
  const key = decodeBase32(secretBase32);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(timestep));

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
 * Returns current 30-second timestep.
 */
export function getCurrentTimestep(timeSeconds?: number, stepSeconds = 30): bigint {
  const ts = timeSeconds !== undefined ? timeSeconds : Date.now() / 1000;
  return BigInt(Math.floor(ts / stepSeconds));
}

export interface VerifyTotpOptions {
  lastTimestep?: bigint | number | null;
  windowSteps?: number;
  currentTimeSeconds?: number;
}

export interface VerifyTotpResult {
  valid: boolean;
  matchedTimestep: bigint | null;
  error?: 'INVALID_FORMAT' | 'CODE_REPLAYED' | 'INVALID_CODE';
}

/**
 * Verifies a candidate 6-digit TOTP code against a Base32 secret.
 * Condition C-047.5:
 * 1. Checks drift window (default +/- 1 step).
 * 2. Timing-safe comparison using crypto.timingSafeEqual.
 * 3. Replay prevention: rejects if matchedTimestep <= lastTimestep.
 */
export function verifyTotpCode(
  secretBase32: string,
  candidateCode: string,
  options?: VerifyTotpOptions,
): VerifyTotpResult {
  const normalizedCode = String(candidateCode || '').trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    return { valid: false, matchedTimestep: null, error: 'INVALID_FORMAT' };
  }

  const currentStep = getCurrentTimestep(options?.currentTimeSeconds);
  const windowSteps = options?.windowSteps !== undefined ? Math.max(0, options.windowSteps) : 1;
  const candidateBuf = Buffer.from(normalizedCode, 'utf8');

  let matchedStep: bigint | null = null;

  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const step = currentStep + BigInt(offset);
    const expectedCode = computeTotpCode(secretBase32, step);
    const expectedBuf = Buffer.from(expectedCode, 'utf8');

    if (candidateBuf.length === expectedBuf.length && crypto.timingSafeEqual(candidateBuf, expectedBuf)) {
      matchedStep = step;
      break;
    }
  }

  if (matchedStep === null) {
    return { valid: false, matchedTimestep: null, error: 'INVALID_CODE' };
  }

  if (options?.lastTimestep !== undefined && options?.lastTimestep !== null) {
    const lastStep = BigInt(options.lastTimestep);
    if (matchedStep <= lastStep) {
      return { valid: false, matchedTimestep: null, error: 'CODE_REPLAYED' };
    }
  }

  return { valid: true, matchedTimestep: matchedStep };
}

/**
 * Generates 8 one-time alphanumeric emergency recovery codes.
 * Condition C-047.6: Shown once to user on enrollment, stored only as SHA-256 hashes.
 */
export function generateRecoveryCodes(count = 8): {
  plainCodes: string[];
  hashedCodes: string[];
} {
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase(); // 10 chars
    const formatted = `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
    plainCodes.push(formatted);
    hashedCodes.push(hashRecoveryCode(formatted));
  }

  return { plainCodes, hashedCodes };
}

/**
 * Computes canonical SHA-256 hash for a recovery code (normalizing hyphens/whitespace).
 */
export function hashRecoveryCode(code: string): string {
  const normalized = String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Verifies recovery code input against stored SHA-256 hash using timingSafeEqual.
 */
export function verifyRecoveryCodeHash(inputCode: string, storedHash: string): boolean {
  if (!inputCode || !storedHash) return false;
  const inputHash = hashRecoveryCode(inputCode);
  const inputHashBuf = Buffer.from(inputHash, 'hex');
  const storedHashBuf = Buffer.from(storedHash, 'hex');

  if (inputHashBuf.length !== storedHashBuf.length) return false;
  return crypto.timingSafeEqual(inputHashBuf, storedHashBuf);
}

/**
 * Generates a 6-digit numeric Email OTP code and its SHA-256 hash.
 */
export function generateEmailOtp(ttlMinutes = 10): {
  code: string;
  codeHash: string;
  expiresAt: Date;
} {
  const code = crypto.randomInt(100000, 1000000).toString();
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  return { code, codeHash, expiresAt };
}

/**
 * Verifies candidate Email OTP numeric string against stored SHA-256 hash using timingSafeEqual.
 */
export function verifyEmailOtpHash(inputCode: string, storedHash: string): boolean {
  const normalized = String(inputCode || '').trim();
  if (!/^\d{6}$/.test(normalized) || !storedHash) return false;

  const candidateHash = crypto.createHash('sha256').update(normalized).digest('hex');
  const candidateBuf = Buffer.from(candidateHash, 'hex');
  const storedBuf = Buffer.from(storedHash, 'hex');

  if (candidateBuf.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(candidateBuf, storedBuf);
}
