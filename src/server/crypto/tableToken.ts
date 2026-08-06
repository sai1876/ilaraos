import { createHmac, timingSafeEqual } from 'node:crypto';

function getSecret(): string {
  const secret = process.env.TABLE_QR_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('FATAL: TABLE_QR_SIGNING_SECRET environment variable is missing or too weak (must be at least 32 characters).');
  }
  return secret;
}

export interface TableTokenPayload {
  tableNo: string;
  outletId: string;
  expiresAt: number;
  iss: string;
  aud: string;
}

export function generateTableToken(tableNo: string, outletId: string, expiresInMs = 2 * 60 * 60 * 1000): string {
  const secret = getSecret();
  const payload: TableTokenPayload = {
    tableNo,
    outletId,
    expiresAt: Date.now() + expiresInMs,
    iss: 'ilara-cafe',
    aud: 'ilara-dinein'
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = createHmac('sha256', secret);
  hmac.update(payloadStr);
  const signature = hmac.digest('base64url');
  return `${payloadStr}.${signature}`;
}

export function verifyTableToken(token: string): TableTokenPayload | null {
  try {
    const secret = getSecret();
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadStr, signature] = parts;

    const hmac = createHmac('sha256', secret);
    hmac.update(payloadStr);
    const expectedSignature = hmac.digest('base64url');

    const sigBuffer = Buffer.from(signature, 'base64url');
    const expectedBuffer = Buffer.from(expectedSignature, 'base64url');

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      return null;
    }

    const payload: TableTokenPayload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
    if (payload.expiresAt <= Date.now()) {
      return null;
    }

    if (payload.iss !== 'ilara-cafe' || payload.aud !== 'ilara-dinein') {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
