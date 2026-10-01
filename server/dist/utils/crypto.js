"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJwtSecret = getJwtSecret;
exports.encryptField = encryptField;
exports.decryptField = decryptField;
const crypto_1 = __importDefault(require("crypto"));
const ALGORITHM = 'aes-256-cbc';
function getJwtSecret() {
    if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
        throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable is missing in production.');
    }
    return process.env.JWT_SECRET || 'dreamtek_dev_jwt_secret_key_2026';
}
function getDbEncryptionKey() {
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
function getDerivedKeys() {
    const hmacDigest = crypto_1.default
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
function encryptField(plainText) {
    if (!plainText)
        return plainText;
    const iv = crypto_1.default.randomBytes(16);
    const { encKey, macKey } = getDerivedKeys();
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, encKey, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    // Compute 512-bit HMAC over iv + encrypted ciphertext
    const mac = crypto_1.default
        .createHmac('sha512', macKey)
        .update(`${iv.toString('hex')}:${encrypted}`)
        .digest('hex');
    return `${iv.toString('hex')}:${mac}:${encrypted}`;
}
/**
 * Decrypts string encrypted with Encrypt-then-HMAC-SHA512.
 * Verifies 512-bit HMAC before attempting decryption using constant-time comparison.
 */
function decryptField(cipherText) {
    if (!cipherText || !cipherText.includes(':'))
        return cipherText;
    try {
        const parts = cipherText.split(':');
        if (parts.length !== 3)
            return cipherText;
        const [ivHex, macHex, encryptedHex] = parts;
        const { encKey, macKey } = getDerivedKeys();
        // Compute expected 512-bit HMAC
        const expectedMac = crypto_1.default
            .createHmac('sha512', macKey)
            .update(`${ivHex}:${encryptedHex}`)
            .digest('hex');
        // Constant-time HMAC comparison
        const macBuf = Buffer.from(macHex, 'hex');
        const expectedBuf = Buffer.from(expectedMac, 'hex');
        if (macBuf.length !== expectedBuf.length || !crypto_1.default.timingSafeEqual(macBuf, expectedBuf)) {
            return cipherText; // HMAC authentication failure
        }
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto_1.default.createDecipheriv(ALGORITHM, encKey, iv);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch (_err) {
        return cipherText;
    }
}
