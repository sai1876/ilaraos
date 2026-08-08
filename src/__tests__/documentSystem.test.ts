import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/firebaseAdmin', () => {
  const docsMap = new Map<string, any>();
  const entityMap = new Map<string, any>();

  const createQueryMock = () => ({
    where: vi.fn().mockImplementation(() => createQueryMock()),
    limit: vi.fn().mockImplementation(() => createQueryMock()),
    orderBy: vi.fn().mockImplementation(() => createQueryMock()),
    get: vi.fn().mockImplementation(async () => ({
      docs: [],
      empty: true,
      forEach: () => {},
    })),
  });

  return {
    adminAuth: {
      verifyIdToken: vi.fn().mockImplementation(async (token: string) => {
        if (token === 'owner-token') return { uid: 'user-owner', role: 'owner' };
        if (token === 'manager-token') return { uid: 'user-manager', role: 'manager' };
        throw new Error('Invalid token');
      }),
    },
    adminDb: {
      collection: (colName: string) => ({
        ...createQueryMock(),
        doc: (docId: string) => ({
          set: vi.fn().mockImplementation(async (data: any) => {
            docsMap.set(`${colName}/${docId}`, data);
            return data;
          }),
          get: vi.fn().mockImplementation(async () => {
            const data = docsMap.get(`${colName}/${docId}`) || entityMap.get(`${colName}/${docId}`);
            return {
              exists: !!data,
              data: () => data,
            };
          }),
          update: vi.fn().mockImplementation(async (data: any) => {
            const existing = docsMap.get(`${colName}/${docId}`) || entityMap.get(`${colName}/${docId}`) || {};
            const updated = { ...existing, ...data };
            docsMap.set(`${colName}/${docId}`, updated);
            return updated;
          }),
        }),
        add: vi.fn().mockImplementation(async (data: any) => {
          const id = `exp-${Date.now()}`;
          entityMap.set(`expenses/${id}`, data);
          return { id };
        }),
      }),
      runTransaction: vi.fn().mockImplementation(async (updateFunction: any) => {
        const transaction = {
          get: async (ref: any) => ref.get(),
          update: (ref: any, data: any) => ref.update(data),
          set: (ref: any, data: any) => ref.set(data),
        };
        return updateFunction(transaction);
      }),
    },
  };
});

vi.mock('@/server/supabase/storageAdmin', () => ({
  createUploadIntent: vi.fn().mockResolvedValue({ signedUrl: 'https://supabase.mock/upload/123', token: 'mock-upload-token' }),
  createPrivateSignedUrl: vi.fn().mockResolvedValue('https://supabase.mock/signed-url?token=300s'),
  verifyObject: vi.fn().mockResolvedValue({ name: 'file.pdf', metadata: { size: 1024 } }),
}));

vi.mock('@/lib/rateLimit', () => ({
  rateLimitDurable: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/server/events/logBusinessEvent', () => ({
  logBusinessEvent: vi.fn().mockResolvedValue({ ok: true }),
}));

import { POST as uploadIntentHandler } from '@/app/api/files/upload-intent/route';
import { POST as expensesHandler } from '@/app/api/expenses/route';

describe('Document Infrastructure & Evidence System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects upload intent without bearer authorization', async () => {
    const req = new Request('http://localhost/api/files/upload-intent', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await uploadIntentHandler(req);
    expect(res.status).toBe(401);
  });

  it('creates upload intent and returns signed URL token for private evidence', async () => {
    const body = {
      category: 'evidence',
      documentType: 'expense_receipt',
      relatedEntityType: 'expenses',
      relatedEntityId: 'exp-100',
      originalFilename: 'receipt_march.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 154000,
    };

    const req = new Request('http://localhost/api/files/upload-intent', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer manager-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const res = await uploadIntentHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.bucket).toBe('ilara-private-files');
    expect(json.signedUrl).toContain('supabase.mock');
    expect(json.document.document_type).toBe('expense_receipt');
    expect(json.document.outlet_id).toBe('main');
  });

  it('rejects expense submission when required evidence is missing with HTTP 422', async () => {
    const body = {
      category: 'food',
      amount: 1500,
      description: 'Vendor vegetables without receipt',
      status: 'submitted',
      document_ids: [],
    };

    const req = new Request('http://localhost/api/expenses', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer manager-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const res = await expensesHandler(req);
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.code).toBe('REQUIRED_EVIDENCE_MISSING');
    expect(json.missing).toContain('expense_receipt');
  });

  it('allows expense draft submission without required evidence', async () => {
    const body = {
      category: 'food',
      amount: 1500,
      description: 'Draft vegetable purchase',
      status: 'draft',
      document_ids: [],
    };

    const req = new Request('http://localhost/api/expenses', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer manager-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const res = await expensesHandler(req);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.success).toBe(true);
  });
});
