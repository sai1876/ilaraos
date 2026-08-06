import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

const CIPHER = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const SCRYPT_KEY_BYTES = 32;
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

export interface EncryptedFieldEnvelope {
  scheme: 'aes-256-gcm';
  key_version: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

export interface PasscodeHashEnvelope {
  scheme: 'scrypt';
  salt: string;
  hash: string;
  key_length: number;
  cost: number;
  block_size: number;
  parallelization: number;
}

export function decodeFieldEncryptionKey(encodedKey: string): Buffer {
  const normalized = encodedKey.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error('STAFF_PRIVATE_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  }

  const key = Buffer.from(normalized, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error('STAFF_PRIVATE_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  return key;
}

export function getConfiguredFieldEncryptionKey(): Buffer {
  return getFieldEncryptionKey(fieldEncryptionKeyVersion());
}

export function fieldEncryptionKeyVersion(): string {
  return process.env.STAFF_PRIVATE_KEY_VERSION?.trim() || 'v1';
}

export function getFieldEncryptionKey(keyVersion: string): Buffer {
  const encodedKeyring = process.env.STAFF_PRIVATE_ENCRYPTION_KEYS?.trim();
  if (encodedKeyring) {
    let keyring: unknown;
    try {
      keyring = JSON.parse(encodedKeyring);
    } catch {
      throw new Error('STAFF_PRIVATE_ENCRYPTION_KEYS must be valid JSON');
    }
    if (typeof keyring !== 'object' || keyring === null || Array.isArray(keyring)) {
      throw new Error('STAFF_PRIVATE_ENCRYPTION_KEYS must be a version-to-key object');
    }
    const encoded = (keyring as Record<string, unknown>)[keyVersion];
    if (typeof encoded === 'string') return decodeFieldEncryptionKey(encoded);
  }
  if (keyVersion === fieldEncryptionKeyVersion() && process.env.STAFF_PRIVATE_ENCRYPTION_KEY) {
    return decodeFieldEncryptionKey(process.env.STAFF_PRIVATE_ENCRYPTION_KEY);
  }
  throw new Error(`Sensitive-field encryption key ${keyVersion} is not configured`);
}

export function getConfiguredPasscodePepper(): string {
  const pepper = process.env.STAFF_PASSCODE_PEPPER;
  if (!pepper || Buffer.byteLength(pepper, 'utf8') < 32) {
    throw new Error('STAFF_PASSCODE_PEPPER must contain at least 32 bytes');
  }
  return pepper;
}

export function fieldAad(collection: string, documentId: string, field: string): string {
  return `${collection}:${documentId}:${field}`;
}

export function encryptField(
  value: unknown,
  key: Buffer,
  aad: string,
  keyVersion = fieldEncryptionKeyVersion(),
): EncryptedFieldEnvelope {
  if (key.length !== KEY_BYTES) throw new Error('Encryption key must be 32 bytes');
  if (!aad) throw new Error('Encryption context is required');

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    scheme: CIPHER,
    key_version: keyVersion,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function decryptField<T>(
  envelope: EncryptedFieldEnvelope,
  key: Buffer,
  aad: string,
): T {
  if (envelope.scheme !== CIPHER) throw new Error('Unsupported encrypted-field scheme');
  if (key.length !== KEY_BYTES) throw new Error('Encryption key must be 32 bytes');
  if (!aad) throw new Error('Encryption context is required');

  const decipher = createDecipheriv(CIPHER, key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}

export function hashPasscode(
  passcode: string,
  salt = randomBytes(16),
  pepper = getConfiguredPasscodePepper(),
): PasscodeHashEnvelope {
  if (!passcode) throw new Error('Passcode cannot be empty');
  if (salt.length !== 16) throw new Error('Passcode salt must be 16 bytes');
  const derived = scryptSync(`${pepper}\u0000${passcode}`, salt, SCRYPT_KEY_BYTES, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: 64 * 1024 * 1024,
  });
  return {
    scheme: 'scrypt',
    salt: salt.toString('base64'),
    hash: derived.toString('base64'),
    key_length: SCRYPT_KEY_BYTES,
    cost: SCRYPT_COST,
    block_size: SCRYPT_BLOCK_SIZE,
    parallelization: SCRYPT_PARALLELIZATION,
  };
}

export function verifyPasscode(
  passcode: string,
  envelope: PasscodeHashEnvelope,
  pepper = getConfiguredPasscodePepper(),
): boolean {
  if (envelope.scheme !== 'scrypt'
      || envelope.key_length !== SCRYPT_KEY_BYTES
      || envelope.cost !== SCRYPT_COST
      || envelope.block_size !== SCRYPT_BLOCK_SIZE
      || envelope.parallelization !== SCRYPT_PARALLELIZATION) return false;
  try {
    const expected = Buffer.from(envelope.hash, 'base64');
    const salt = Buffer.from(envelope.salt, 'base64');
    if (expected.length !== SCRYPT_KEY_BYTES || salt.length !== 16) return false;
    const actual = scryptSync(`${pepper}\u0000${passcode}`, salt, SCRYPT_KEY_BYTES, {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION,
      maxmem: 64 * 1024 * 1024,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
