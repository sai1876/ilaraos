import {
  decryptField,
  encryptField,
  fieldAad,
  getFieldEncryptionKey,
  getConfiguredFieldEncryptionKey,
  FieldEncryptionConfigurationError,
  FieldDecryptionError,
  type EncryptedFieldEnvelope,
} from '@/server/crypto/fieldEncryption';

export class TotpConfigurationError extends Error {
  constructor(message: string = 'Two-factor authentication is temporarily unavailable.') {
    super(message);
    this.name = 'TotpConfigurationError';
  }
}

export class TotpResetRequiredError extends Error {
  constructor(message: string = 'Two-factor authentication must be re-enrolled.') {
    super(message);
    this.name = 'TotpResetRequiredError';
  }
}

type SecretDocument = {
  secret?: unknown;
  secret_encrypted?: unknown;
};

function isEncryptedEnvelope(value: unknown): value is EncryptedFieldEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const envelope = value as Partial<EncryptedFieldEnvelope>;
  return envelope.scheme === 'aes-256-gcm'
    && typeof envelope.key_version === 'string'
    && typeof envelope.iv === 'string'
    && typeof envelope.tag === 'string'
    && typeof envelope.ciphertext === 'string';
}

export function encryptTotpSecret(uid: string, secret: string): EncryptedFieldEnvelope {
  try {
    return encryptField(
      secret,
      getConfiguredFieldEncryptionKey(),
      fieldAad('admin_secrets', uid, 'secret'),
    );
  } catch (error) {
    if (error instanceof FieldEncryptionConfigurationError) {
      throw new TotpConfigurationError(error.message);
    }
    throw error;
  }
}

export function readTotpSecret(uid: string, data: SecretDocument | undefined): string | null {
  if (!data) return null;
  if (isEncryptedEnvelope(data.secret_encrypted)) {
    try {
      const key = getFieldEncryptionKey(data.secret_encrypted.key_version);
      return decryptField<string>(
        data.secret_encrypted,
        key,
        fieldAad('admin_secrets', uid, 'secret'),
      );
    } catch (error) {
      if (error instanceof FieldEncryptionConfigurationError) {
        throw new TotpConfigurationError(error.message);
      }
      if (error instanceof FieldDecryptionError) {
        throw new TotpResetRequiredError(error.message);
      }
      throw new TotpResetRequiredError(error instanceof Error ? error.message : 'TOTP secret decryption failed');
    }
  }

  // Temporary compatibility for legacy unencrypted records
  if (typeof data.secret === 'string' && data.secret) {
    return data.secret;
  }

  return null;
}
