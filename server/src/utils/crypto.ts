import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';

export function getJwtSecret(): string {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing in production.');
  }
  return process.env.JWT_SECRET || 'dreamtek_dev_jwt_secret_key_2026';
}

function getDbEncryptionKey(): string {
  if (process.env.NODE_ENV === 'production' && !process.env.DB_ENCRYPTION_KEY) {
    throw new Error('FATAL SECURITY ERROR: DB_ENCRYPTION_KEY environment variable is missing in production.');
  }
  return process.env.DB_ENCRYPTION_KEY || 'dreamtek_dev_db_encryption_key_512bits_2026';
}

/**
 * Derives a 64-byte (512-bit) key material using HMAC-SHA512 with DB_ENCRYPTION_KEY.
 * - Bytes 0..31 (256 bits): Encryption Key for AES-256-CBC
 * - Bytes 32..63 (256 bits): Authentication Key for HMAC-SHA512
 */
function getDerivedKeys(): { encKey: Buffer; macKey: Buffer } {
  const hmacDigest = crypto
    .createHmac('sha512', getDbEncryptionKey())
    .update('dreamtek_db_encryption_salt_2026')
    .digest();
  return {
    encKey: hmacDigest.subarray(0, 32),
    macKey: hmacDigest.subarray(32, 64),
  };
}

/**
 * Encrypts plain text using Encrypt-then-HMAC-SHA512:
 * Output format: iv_hex:hmac512_hex:encrypted_hex
 */
export function encryptField(plainText: string): string {
  if (!plainText) return plainText;
  const iv = crypto.randomBytes(16);
  const { encKey, macKey } = getDerivedKeys();
  
  const cipher = crypto.createCipheriv(ALGORITHM, encKey, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Compute 512-bit HMAC over iv + encrypted ciphertext
  const mac = crypto.createHmac('sha512', macKey)
    .update(`${iv.toString('hex')}:${encrypted}`)
    .digest('hex');
  
  return `${iv.toString('hex')}:${mac}:${encrypted}`;
}

/**
 * Decrypts string encrypted with Encrypt-then-HMAC-SHA512.
 * Verifies 512-bit HMAC before attempting decryption using constant-time comparison.
 */
export function decryptField(cipherText: string): string {
  if (!cipherText || !cipherText.includes(':')) return cipherText;
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 3) return cipherText;
    
    const [ivHex, macHex, encryptedHex] = parts;
    const { encKey, macKey } = getDerivedKeys();

    // Compute expected 512-bit HMAC
    const expectedMac = crypto.createHmac('sha512', macKey)
      .update(`${ivHex}:${encryptedHex}`)
      .digest('hex');

    // Constant-time HMAC comparison
    const macBuf = Buffer.from(macHex, 'hex');
    const expectedBuf = Buffer.from(expectedMac, 'hex');

    if (macBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(macBuf, expectedBuf)) {
      return cipherText; // HMAC authentication failure
    }
    
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, encKey, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (_err) {
    return cipherText;
  }
}
