/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getMfaVaultKey,
  encryptTotpSecret,
  decryptTotpSecret,
  encodeBase32,
  decodeBase32,
  generateTotpSecret,
  computeTotpCode,
  getCurrentTimestep,
  verifyTotpCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCodeHash,
  generateEmailOtp,
  verifyEmailOtpHash,
} from '../../../server/src/utils/totp';

describe('RFC 6238 Native TOTP & Cryptographic Vault Suite (FC 047 / C-047.1-9)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Condition C-047.2: MFA_VAULT_KEY and AES-256-GCM Vault', () => {
    it('uses fallback dev key when MFA_VAULT_KEY is not set in non-production', () => {
      delete process.env.MFA_VAULT_KEY;
      process.env.NODE_ENV = 'test';
      const key = getMfaVaultKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('uses custom MFA_VAULT_KEY when provided', () => {
      process.env.MFA_VAULT_KEY = 'super_secret_production_mfa_vault_key_2026';
      const key = getMfaVaultKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('fails closed in production if MFA_VAULT_KEY is missing', () => {
      delete process.env.MFA_VAULT_KEY;
      process.env.NODE_ENV = 'production';
      expect(() => getMfaVaultKey()).toThrow(
        'FATAL SECURITY ERROR: MFA_VAULT_KEY environment variable is missing in production.',
      );
    });

    it('encrypts and decrypts a Base32 secret cleanly', () => {
      const plainSecret = 'JBSWY3DPEHPK3PXP';
      const encrypted = encryptTotpSecret(plainSecret);
      expect(encrypted).not.toBe(plainSecret);
      expect(encrypted.split(':').length).toBe(3);

      const decrypted = decryptTotpSecret(encrypted);
      expect(decrypted).toBe(plainSecret);
    });

    it('returns empty string if plainSecret or encryptedString is falsy', () => {
      expect(encryptTotpSecret('')).toBe('');
      expect(decryptTotpSecret('')).toBe('');
    });

    it('fails closed when decrypting corrupted or invalid formats', () => {
      expect(() => decryptTotpSecret('invalid_format_without_colons')).toThrow(
        'Invalid encrypted TOTP secret format.',
      );

      const validEncrypted = encryptTotpSecret('MYSECRET');
      const parts = validEncrypted.split(':');
      const tampered = `${parts[0]}:${parts[1]}:deadbeef`;
      expect(() => decryptTotpSecret(tampered)).toThrow();
    });
  });

  describe('RFC 4648 Base32 Encoding & Decoding', () => {
    it('encodes and decodes buffers correctly', () => {
      const buffer = Buffer.from('Hello, World!', 'utf8');
      const encoded = encodeBase32(buffer);
      expect(encoded).toBe('JBSWY3DPFQQFO33SNRSCC');

      const decoded = decodeBase32(encoded);
      expect(decoded.toString('utf8')).toBe('Hello, World!');
    });

    it('handles padding, whitespace, hyphens, and lowercase gracefully during decoding', () => {
      const buffer = Buffer.from('Dreamtek Security', 'utf8');
      const encoded = encodeBase32(buffer);
      const withFormatting = `  ${encoded.slice(0, 4)}-${encoded.slice(4).toLowerCase()}===  `;

      const decoded = decodeBase32(withFormatting);
      expect(decoded.toString('utf8')).toBe('Dreamtek Security');
    });

    it('throws on invalid base32 characters', () => {
      expect(() => decodeBase32('INVALID189!')).toThrow('Invalid Base32 character: 1');
    });
  });

  describe('RFC 6238 TOTP Secret Generation & Computation', () => {
    it('generates a 32-character Base32 secret and valid otpauth:// URL', () => {
      const { secretBase32, otpauthUrl } = generateTotpSecret(
        'user@dreamtek.tech',
        'Dreamtek Enterprise',
      );
      expect(secretBase32.length).toBe(32);
      expect(otpauthUrl).toContain('otpauth://totp/Dreamtek%20Enterprise:user%40dreamtek.tech');
      expect(otpauthUrl).toContain(`secret=${secretBase32}`);
      expect(otpauthUrl).toContain('period=30');
      expect(otpauthUrl).toContain('digits=6');
    });

    it('computes expected 6-digit TOTP code for a known timestep', () => {
      const secret = 'JBSWY3DPEHPK3PXP'; // Base32 for "Hello!\xde\xad\xbe\xef"
      const timestep = 12345678n;
      const code = computeTotpCode(secret, timestep);
      expect(code).toMatch(/^\d{6}$/);
    });

    it('calculates current 30-second timestep correctly', () => {
      const t = 1700000000;
      const step = getCurrentTimestep(t);
      expect(step).toBe(BigInt(Math.floor(1700000000 / 30)));

      const autoStep = getCurrentTimestep();
      expect(typeof autoStep).toBe('bigint');
    });
  });

  describe('Condition C-047.5: Anti-Replay, Timing Safe & Verification', () => {
    it('validates a correct code in current step (offset 0)', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const fixedTime = 1700000015;
      const currentStep = getCurrentTimestep(fixedTime);
      const code = computeTotpCode(secret, currentStep);

      // Without options
      const defaultResult = verifyTotpCode(secret, code);
      expect(typeof defaultResult.valid).toBe('boolean');

      const result = verifyTotpCode(secret, code, { currentTimeSeconds: fixedTime });
      expect(result.valid).toBe(true);
      expect(result.matchedTimestep).toBe(currentStep);

      // Custom windowSteps
      const customWindowResult = verifyTotpCode(secret, code, {
        currentTimeSeconds: fixedTime,
        windowSteps: 2,
        lastTimestep: null,
      });
      expect(customWindowResult.valid).toBe(true);
    });

    it('validates a code within clock drift window (offset -1 and +1)', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const fixedTime = 1700000030;
      const currentStep = getCurrentTimestep(fixedTime);

      const pastCode = computeTotpCode(secret, currentStep - 1n);
      const pastResult = verifyTotpCode(secret, pastCode, { currentTimeSeconds: fixedTime });
      expect(pastResult.valid).toBe(true);
      expect(pastResult.matchedTimestep).toBe(currentStep - 1n);

      const futureCode = computeTotpCode(secret, currentStep + 1n);
      const futureResult = verifyTotpCode(secret, futureCode, { currentTimeSeconds: fixedTime });
      expect(futureResult.valid).toBe(true);
      expect(futureResult.matchedTimestep).toBe(currentStep + 1n);
    });

    it('rejects code outside of clock drift window', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const fixedTime = 1700000030;
      const currentStep = getCurrentTimestep(fixedTime);

      const wayPastCode = computeTotpCode(secret, currentStep - 5n);
      const result = verifyTotpCode(secret, wayPastCode, { currentTimeSeconds: fixedTime });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_CODE');
    });

    it('rejects malformed code string (letters, wrong length, empty)', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      expect(verifyTotpCode(secret, 'abc123').error).toBe('INVALID_FORMAT');
      expect(verifyTotpCode(secret, '12345').error).toBe('INVALID_FORMAT');
      expect(verifyTotpCode(secret, '1234567').error).toBe('INVALID_FORMAT');
      expect(verifyTotpCode(secret, '').error).toBe('INVALID_FORMAT');
    });

    it('enforces anti-replay when matched timestep <= lastTimestep (C-047.5)', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const fixedTime = 1700000010;
      const currentStep = getCurrentTimestep(fixedTime);
      const code = computeTotpCode(secret, currentStep);

      // Replay attempt with same timestep
      const replayResult = verifyTotpCode(secret, code, {
        currentTimeSeconds: fixedTime,
        lastTimestep: currentStep,
      });
      expect(replayResult.valid).toBe(false);
      expect(replayResult.error).toBe('CODE_REPLAYED');

      // Replay attempt with older timestep
      const olderReplayResult = verifyTotpCode(secret, code, {
        currentTimeSeconds: fixedTime,
        lastTimestep: currentStep + 1n,
      });
      expect(olderReplayResult.valid).toBe(false);
      expect(olderReplayResult.error).toBe('CODE_REPLAYED');

      // Legitimate future timestep is accepted
      const nextStepCode = computeTotpCode(secret, currentStep + 1n);
      const validResult = verifyTotpCode(secret, nextStepCode, {
        currentTimeSeconds: fixedTime + 30,
        lastTimestep: currentStep,
      });
      expect(validResult.valid).toBe(true);
      expect(validResult.matchedTimestep).toBe(currentStep + 1n);
    });
  });

  describe('Condition C-047.6: One-Time Emergency Recovery Codes', () => {
    it('generates 8 formatted recovery codes and SHA-256 hashes', () => {
      const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
      expect(plainCodes.length).toBe(8);
      expect(hashedCodes.length).toBe(8);

      for (let i = 0; i < 8; i++) {
        expect(plainCodes[i]).toMatch(/^[A-F0-9]{5}-[A-F0-9]{5}$/);
        expect(hashedCodes[i].length).toBe(64);
        expect(hashRecoveryCode(plainCodes[i])).toBe(hashedCodes[i]);
      }
    });

    it('verifies valid recovery code with timingSafeEqual and normalizes hyphens/whitespace', () => {
      const { plainCodes, hashedCodes } = generateRecoveryCodes(1);
      const plain = plainCodes[0];
      const hash = hashedCodes[0];

      // Exact match
      expect(verifyRecoveryCodeHash(plain, hash)).toBe(true);
      // Normalized match (lower case, without hyphen, with spaces)
      const formattedInput = ` ${plain.toLowerCase().replace('-', '')} `;
      expect(verifyRecoveryCodeHash(formattedInput, hash)).toBe(true);

      // Incorrect code
      expect(verifyRecoveryCodeHash('WRONG-12345', hash)).toBe(false);
      // Missing code or hash
      expect(verifyRecoveryCodeHash('', hash)).toBe(false);
      expect(verifyRecoveryCodeHash(plain, '')).toBe(false);
      // Empty code hashing
      expect(hashRecoveryCode('')).toBeDefined();
      expect(hashRecoveryCode(null as any)).toBeDefined();
      // Tampered hash length
      expect(verifyRecoveryCodeHash(plain, 'short_hash')).toBe(false);
    });
  });

  describe('Email OTP Generator & Verifier', () => {
    it('generates 6-digit cryptographic numeric code and expiration', () => {
      const { code, codeHash, expiresAt } = generateEmailOtp(10);
      expect(code).toMatch(/^\d{6}$/);
      expect(codeHash.length).toBe(64);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('verifies Email OTP correctly using timingSafeEqual', () => {
      const { code, codeHash } = generateEmailOtp(10);
      expect(verifyEmailOtpHash(code, codeHash)).toBe(true);
      expect(verifyEmailOtpHash('999999', codeHash)).toBe(false);
      expect(verifyEmailOtpHash('invalid', codeHash)).toBe(false);
      expect(verifyEmailOtpHash('', codeHash)).toBe(false);
      expect(verifyEmailOtpHash(code, '')).toBe(false);
      expect(verifyEmailOtpHash(code, 'short_hash')).toBe(false);
    });
  });
});
