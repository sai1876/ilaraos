import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  decodeFieldEncryptionKey,
  FieldEncryptionConfigurationError,
} from '@/server/crypto/fieldEncryption';
import {
  encryptTotpSecret,
  readTotpSecret,
  TotpConfigurationError,
  TotpResetRequiredError,
} from '@/server/auth/totpSecret';

// Valid 32-byte base64 keys for testing
const TEST_KEY_V1 = Buffer.alloc(32, 1).toString('base64');
const TEST_KEY_V2 = Buffer.alloc(32, 2).toString('base64');
const TEST_KEY_WRONG = Buffer.alloc(32, 9).toString('base64');

describe('TOTP Encryption and Key Rotation Security', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('validates base64 key decoding strictly to 32 bytes', () => {
    expect(() => decodeFieldEncryptionKey(TEST_KEY_V1)).not.toThrow();

    // Invalid base64 or wrong length
    expect(() => decodeFieldEncryptionKey('invalid-base64!!!')).toThrow(FieldEncryptionConfigurationError);
    expect(() => decodeFieldEncryptionKey(Buffer.alloc(16).toString('base64'))).toThrow(FieldEncryptionConfigurationError);
  });

  it('encrypts and decrypts secret with current key version v1', () => {
    process.env.STAFF_PRIVATE_KEY_VERSION = 'v1';
    process.env.STAFF_PRIVATE_ENCRYPTION_KEY = TEST_KEY_V1;

    const uid = 'user_test_123';
    const secret = 'JBSWY3DPEHPK3PXP';

    const encrypted = encryptTotpSecret(uid, secret);
    expect(encrypted.scheme).toBe('aes-256-gcm');
    expect(encrypted.key_version).toBe('v1');

    const decrypted = readTotpSecret(uid, { secret_encrypted: encrypted });
    expect(decrypted).toBe(secret);
  });

  it('decrypts historical v1 secret using keyring when active key version is v2', () => {
    const uid = 'user_test_keyring';
    const secret = 'KVKFKRSTNVQVARKF';

    // 1. Encrypt with v1
    process.env.STAFF_PRIVATE_KEY_VERSION = 'v1';
    process.env.STAFF_PRIVATE_ENCRYPTION_KEY = TEST_KEY_V1;
    const v1Encrypted = encryptTotpSecret(uid, secret);

    // 2. Rotate to v2 with keyring containing v1 and v2
    process.env.STAFF_PRIVATE_KEY_VERSION = 'v2';
    process.env.STAFF_PRIVATE_ENCRYPTION_KEYS = JSON.stringify({
      v1: TEST_KEY_V1,
      v2: TEST_KEY_V2,
    });
    delete process.env.STAFF_PRIVATE_ENCRYPTION_KEY;

    const decrypted = readTotpSecret(uid, { secret_encrypted: v1Encrypted });
    expect(decrypted).toBe(secret);
  });

  it('throws TotpResetRequiredError when secret was encrypted with a lost key', () => {
    const uid = 'user_lost_key';
    const secret = 'OR2XIZLTO5XXEZLU';

    // Encrypt with v1
    process.env.STAFF_PRIVATE_KEY_VERSION = 'v1';
    process.env.STAFF_PRIVATE_ENCRYPTION_KEY = TEST_KEY_V1;
    const encrypted = encryptTotpSecret(uid, secret);

    // Keyring only contains v2 (v1 is missing/lost)
    process.env.STAFF_PRIVATE_KEY_VERSION = 'v2';
    process.env.STAFF_PRIVATE_ENCRYPTION_KEYS = JSON.stringify({
      v1: TEST_KEY_WRONG, // Wrong key provided for v1
      v2: TEST_KEY_V2,
    });
    delete process.env.STAFF_PRIVATE_ENCRYPTION_KEY;

    expect(() => readTotpSecret(uid, { secret_encrypted: encrypted })).toThrow(TotpResetRequiredError);
  });

  it('throws TotpConfigurationError when encryption key is not configured in env', () => {
    const uid = 'user_missing_config';

    // Secret encrypted with v1
    const encrypted = {
      scheme: 'aes-256-gcm' as const,
      key_version: 'v1',
      iv: 'dGVzdGl2ZGF0YQ==',
      tag: 'dGVzdHRhZ2RhdGE=',
      ciphertext: 'dGVzdGNpcGhlcg==',
    };

    // Environment has no keys configured
    delete process.env.STAFF_PRIVATE_KEY_VERSION;
    delete process.env.STAFF_PRIVATE_ENCRYPTION_KEY;
    delete process.env.STAFF_PRIVATE_ENCRYPTION_KEYS;

    expect(() => readTotpSecret(uid, { secret_encrypted: encrypted })).toThrow(TotpConfigurationError);
  });

  it('throws TotpResetRequiredError on corrupted AES-GCM ciphertext', () => {
    process.env.STAFF_PRIVATE_KEY_VERSION = 'v1';
    process.env.STAFF_PRIVATE_ENCRYPTION_KEY = TEST_KEY_V1;

    const uid = 'user_corrupt';
    const encrypted = encryptTotpSecret(uid, 'VALIDSECRET123');

    // Corrupt ciphertext
    encrypted.ciphertext = Buffer.from('corrupted_payload').toString('base64');

    expect(() => readTotpSecret(uid, { secret_encrypted: encrypted })).toThrow(TotpResetRequiredError);
  });
});
