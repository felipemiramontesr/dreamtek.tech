import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const DB_ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY || 'dreamtek_default_db_encryption_key_512bits_2026';

/**
 * Derives a 32-byte (256-bit) Key Buffer from DB_ENCRYPTION_KEY using SHA-256.
 */
function getKeyBuffer(): Buffer {
  return crypto.createHash('sha256').update(DB_ENCRYPTION_KEY).digest();
}

/**
 * Encrypts plain text using AES-256-GCM.
 * Output format: iv_hex:auth_tag_hex:encrypted_hex
 */
export function encryptField(plainText: string): string {
  if (!plainText) return plainText;
  const iv = crypto.randomBytes(12);
  const key = getKeyBuffer();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts encrypted string format iv_hex:auth_tag_hex:encrypted_hex.
 * Returns original plain text.
 */
export function decryptField(cipherText: string): string {
  if (!cipherText || !cipherText.includes(':')) return cipherText;
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 3) return cipherText;
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = getKeyBuffer();
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (_err) {
    return cipherText; // Fallback if not encrypted
  }
}
