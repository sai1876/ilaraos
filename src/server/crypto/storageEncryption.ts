import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const CIPHER = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

export interface EncryptedStorageToken {
  scheme: 'aes-256-gcm';
  iv: string;
  tag: string;
  ciphertext: string;
}

export class StorageEncryptionConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageEncryptionConfigurationError';
  }
}

export class StorageDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageDecryptionError';
  }
}

function getStorageEncryptionKey(): Buffer {
  const encodedKey = process.env.STORAGE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!encodedKey) {
    throw new StorageEncryptionConfigurationError('STORAGE_TOKEN_ENCRYPTION_KEY is not configured');
  }

  const normalized = encodedKey.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new StorageEncryptionConfigurationError('STORAGE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  }

  const key = Buffer.from(normalized, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new StorageEncryptionConfigurationError('STORAGE_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }

  return key;
}

export function encryptStorageToken(plaintextToken: string, aadContext: string): EncryptedStorageToken {
  if (!plaintextToken) throw new Error('Token cannot be empty');
  if (!aadContext) throw new Error('Encryption context (AAD) is required');

  const key = getStorageEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, key, iv);
  
  cipher.setAAD(Buffer.from(aadContext, 'utf8'));
  const plaintext = Buffer.from(plaintextToken, 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    scheme: CIPHER,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function decryptStorageToken(envelope: EncryptedStorageToken, aadContext: string): string {
  if (envelope.scheme !== CIPHER) throw new StorageDecryptionError('Unsupported encryption scheme');
  if (!aadContext) throw new Error('Encryption context (AAD) is required');

  const key = getStorageEncryptionKey();
  
  try {
    const decipher = createDecipheriv(CIPHER, key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(aadContext, 'utf8'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]);
    
    return plaintext.toString('utf8');
  } catch (error: any) {
    if (error instanceof StorageEncryptionConfigurationError) throw error;
    throw new StorageDecryptionError(error?.message || 'Failed to decrypt storage token');
  }
}
