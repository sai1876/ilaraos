import {
  decryptField,
  encryptField,
  fieldAad,
  getFieldEncryptionKey,
  getConfiguredFieldEncryptionKey,
  type EncryptedFieldEnvelope,
} from '@/server/crypto/fieldEncryption';

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
  return encryptField(
    secret,
    getConfiguredFieldEncryptionKey(),
    fieldAad('admin_secrets', uid, 'secret'),
  );
}

export function readTotpSecret(uid: string, data: SecretDocument | undefined): string | null {
  if (!data) return null;
  if (isEncryptedEnvelope(data.secret_encrypted)) {
    return decryptField<string>(
      data.secret_encrypted,
      getFieldEncryptionKey(data.secret_encrypted.key_version),
      fieldAad('admin_secrets', uid, 'secret'),
    );
  }

  // Temporary compatibility for records not yet processed by the migration.
  return typeof data.secret === 'string' && data.secret ? data.secret : null;
}
