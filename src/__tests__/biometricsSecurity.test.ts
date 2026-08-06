import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as createSession } from '../app/api/operations/biometrics/session/route';
import { POST as verifyBiometrics } from '../app/api/operations/biometrics/verify/route';
import { requireSessionActor } from '../server/auth/requireSessionActor';

const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  createdDocs: [] as Array<{ path: string; data: Record<string, unknown> }>,
}));

vi.mock('../server/auth/requireSessionActor', () => ({
  requireSessionActor: vi.fn(),
}));

vi.mock('../server/crypto/fieldEncryption', () => ({
  getConfiguredFieldEncryptionKey: vi.fn(() => Buffer.alloc(32)),
  getFieldEncryptionKey: vi.fn(() => Buffer.alloc(32)),
  fieldEncryptionKeyVersion: vi.fn(() => 'v1'),
  encryptField: vi.fn(() => ({ ciphertext: 'encrypted_data', key_version: 'v1', iv: 'iv', auth_tag: 'tag' })),
  decryptField: vi.fn(() => Array(128).fill(0.1)),
  fieldAad: vi.fn(() => 'aad'),
}));

vi.mock('../lib/rateLimit', () => ({
  rateLimitDurable: vi.fn(async () => ({ success: true, source: 'memory', retryAfterMs: 0 })),
}));

vi.mock('../lib/firebaseAdmin', () => {
  const mockTransaction = {
    get: vi.fn(async (ref: any) => {
      const value = state.docs.get(ref.path);
      return { exists: Boolean(value), data: () => value };
    }),
    set: vi.fn((ref: any, data: any, options: any) => {
      const existing = state.docs.get(ref.path) || {};
      state.docs.set(ref.path, { ...existing, ...data });
    }),
    update: vi.fn((ref: any, data: any) => {
      const existing = state.docs.get(ref.path) || {};
      state.docs.set(ref.path, { ...existing, ...data });
    }),
  };

  const db = {
    collection: (colName: string) => ({
      doc: (docId: string) => {
        const path = `${colName}/${docId}`;
        return {
          path,
          id: docId,
          get: async () => {
            const val = state.docs.get(path);
            return { exists: Boolean(val), data: () => val };
          },
          set: async (data: any) => {
            state.docs.set(path, data);
            state.createdDocs.push({ path, data });
          },
          update: async (data: any) => {
            const existing = state.docs.get(path) || {};
            state.docs.set(path, { ...existing, ...data });
          },
        };
      },
      where: () => ({
        limit: () => ({
          get: async () => ({ empty: true, docs: [] }),
        }),
      }),
    }),
    runTransaction: async (cb: any) => {
      return cb(mockTransaction);
    },
  };

  return { adminDb: db };
});

describe('Biometrics Security API Checks', () => {
  beforeEach(() => {
    state.docs.clear();
    state.createdDocs.length = 0;
    vi.clearAllMocks();
  });

  it('session/POST generates secure 128-bit-or-stronger cryptographic token', async () => {
    vi.mocked(requireSessionActor).mockResolvedValueOnce({
      uid: 'manager_uid',
      role: 'manager',
      phone: '+919999999999',
    } as any);

    const req = new Request('http://localhost/api/biometrics/session', {
      method: 'POST',
      body: JSON.stringify({ type: 'enroll', staff_id: 'staff_1' }),
    });

    const res = await createSession(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Cryptographic session ID starts with 'scan_' followed by a strong 128-bit hex string (32 characters)
    expect(body.session_id).toMatch(/^scan_[a-f0-9]{32}$/);

    const savedDoc = state.createdDocs[0];
    expect(savedDoc).toBeDefined();
    expect(savedDoc.data.status).toBe('pending');
    expect(savedDoc.data.created_by).toBe('manager_uid');
    expect(savedDoc.data.staff_id).toBe('staff_1');
    expect(savedDoc.data.expires_at).toBeGreaterThan(Date.now());
  });

  it('verify/POST rejects face descriptors not exactly of length 128', async () => {
    const invalidDescriptor = Array(120).fill(0.1); // Length is 120, invalid!
    const req = new Request('http://localhost/api/biometrics/verify', {
      method: 'POST',
      body: JSON.stringify({ session_id: 'scan_1234', descriptor: invalidDescriptor }),
    });

    const res = await verifyBiometrics(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('descriptor format');
  });

  it('verify/POST rejects face descriptors containing NaN or Infinity values', async () => {
    const invalidDescriptor = Array(128).fill(0.1);
    invalidDescriptor[10] = NaN; // Inject NaN!

    const req = new Request('http://localhost/api/biometrics/verify', {
      method: 'POST',
      body: JSON.stringify({ session_id: 'scan_1234', descriptor: invalidDescriptor }),
    });

    const res = await verifyBiometrics(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('descriptor elements');
  });

  it('verify/POST consumes session once inside transaction and prevents replay', async () => {
    // Populate session doc as completed
    const sessionPath = 'scan_sessions/scan_completed_123';
    state.docs.set(sessionPath, {
      status: 'success', // Already completed
      type: 'enroll',
      staff_id: 'staff_1',
      expires_at: Date.now() + 100000,
    });

    const validDescriptor = Array(128).fill(0.1);
    const req = new Request('http://localhost/api/biometrics/verify', {
      method: 'POST',
      body: JSON.stringify({ session_id: 'scan_completed_123', descriptor: validDescriptor }),
    });

    const res = await verifyBiometrics(req);
    expect(res.status).toBe(410); // Status 410 Gone / Session expired or completed
    const body = await res.json();
    expect(body.error).toContain('Session already completed');
  });
});
