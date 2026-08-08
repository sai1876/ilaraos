import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/auth/session/route';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { verifyPreAuthChallenge } from '@/server/auth/preAuthChallenge';
import { authenticator } from 'otplib';

vi.mock('@/lib/firebaseAdmin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn(),
    createSessionCookie: vi.fn(),
    createCustomToken: vi.fn(),
  },
  adminDb: {
    collection: vi.fn(),
  },
}));

vi.mock('@/server/auth/preAuthChallenge', () => ({
  verifyPreAuthChallenge: vi.fn(),
  PREAUTH_COOKIE_NAME: 'mock_preauth_cookie'
}));

vi.mock('otplib', () => ({
  authenticator: {
    verify: vi.fn(),
    generateSecret: vi.fn(),
    keyuri: vi.fn(),
    options: {}
  }
}));

vi.mock('@/lib/rateLimit', () => ({
  rateLimitDurable: vi.fn().mockResolvedValue({ success: true })
}));

vi.mock('@/server/auth/totpSecret', () => ({
  readTotpSecret: vi.fn().mockReturnValue('mock_secret')
}));

function mockRequest(body: any, cookies: string = 'mock_preauth_cookie=valid_token') {
  return {
    json: async () => body,
    headers: {
      get: (key: string) => key.toLowerCase() === 'cookie' ? cookies : null
    }
  } as unknown as Request;
}

describe('POST /api/auth/session action=verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mocks for success
    (verifyPreAuthChallenge as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ uid: 'user_123', role: 'manager', staffId: 'staff_123' });
    (adminAuth.verifyIdToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ uid: 'user_123', auth_time: Date.now() / 1000 - 60 }); // 1 min ago
    (adminAuth.createSessionCookie as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('mock_session_cookie');
    (authenticator.verify as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
    
    const mockDoc = { exists: true, data: () => ({ status: 'active', verified: true }) };
    (adminDb.collection as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue(mockDoc),
        update: vi.fn().mockResolvedValue({})
      })
    });
  });

  it('valid ID token + valid TOTP -> session success', async () => {
    const req = mockRequest({ action: 'verify', totpCode: '123456', idToken: 'valid_id_token' });
    const res = await POST(req);
    const json = await res.json();
    
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(adminAuth.createCustomToken).not.toHaveBeenCalled(); // valid TOTP must NEVER call createCustomToken
    expect(adminAuth.createSessionCookie).toHaveBeenCalledWith('valid_id_token', expect.any(Object)); // createSessionCookie receives exactly the Firebase ID token
  });

  it('missing ID token -> 400 INVALID_REQUEST', async () => {
    const req = mockRequest({ action: 'verify', totpCode: '123456' }); // no idToken
    const res = await POST(req);
    const json = await res.json();
    
    expect(res.status).toBe(400);
    expect(json.code).toBe('INVALID_REQUEST');
  });

  it('malformed ID token -> 401 INVALID_SESSION_ID_TOKEN', async () => {
    (adminAuth.verifyIdToken as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('invalid token'));
    const req = mockRequest({ action: 'verify', totpCode: '123456', idToken: 'bad_token' });
    const res = await POST(req);
    const json = await res.json();
    
    expect(res.status).toBe(401);
    expect(json.code).toBe('INVALID_SESSION_ID_TOKEN');
  });

  it('ID token UID != pre-auth UID -> 403 AUTH_IDENTITY_MISMATCH', async () => {
    (adminAuth.verifyIdToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ uid: 'other_user', auth_time: Date.now() / 1000 - 60 });
    const req = mockRequest({ action: 'verify', totpCode: '123456', idToken: 'valid_id_token' });
    const res = await POST(req);
    const json = await res.json();
    
    expect(res.status).toBe(403);
    expect(json.code).toBe('AUTH_IDENTITY_MISMATCH');
  });

  it('stale auth_time -> 401 RECENT_LOGIN_REQUIRED', async () => {
    (adminAuth.verifyIdToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ uid: 'user_123', auth_time: Date.now() / 1000 - 600 }); // 10 mins ago
    const req = mockRequest({ action: 'verify', totpCode: '123456', idToken: 'valid_id_token' });
    const res = await POST(req);
    const json = await res.json();
    
    expect(res.status).toBe(401);
    expect(json.code).toBe('RECENT_LOGIN_REQUIRED');
  });

  it('invalid TOTP -> 401 INVALID_TOTP', async () => {
    (authenticator.verify as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const req = mockRequest({ action: 'verify', totpCode: '000000', idToken: 'valid_id_token' });
    const res = await POST(req);
    const json = await res.json();
    
    expect(res.status).toBe(401);
    expect(json.code).toBe('INVALID_TOTP');
  });
});
