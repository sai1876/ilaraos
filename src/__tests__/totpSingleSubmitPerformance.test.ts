import { describe, it, expect } from 'vitest';
import { createPreAuthChallenge, verifyPreAuthChallenge } from '../server/auth/preAuthChallenge';

describe('Phase 23 TOTP Performance & Single-Submit Tests', () => {
  it('creates and verifies a signed pre-auth challenge cookie', () => {
    const challenge = createPreAuthChallenge({
      uid: 'staff-user-001',
      staffId: 'staff-001',
      role: 'manager',
      outletId: 'main',
      tokenVersion: 1,
    });

    expect(challenge.cookieName).toBe('__staff_pre_auth');
    expect(challenge.token).toContain('.');

    const verified = verifyPreAuthChallenge(challenge.token);
    expect(verified).not.toBeNull();
    expect(verified?.uid).toBe('staff-user-001');
    expect(verified?.staffId).toBe('staff-001');
    expect(verified?.role).toBe('manager');
    expect(verified?.outletId).toBe('main');
  });

  it('rejects tampered pre-auth challenge tokens', () => {
    const challenge = createPreAuthChallenge({
      uid: 'staff-user-001',
      staffId: 'staff-001',
      role: 'manager',
      outletId: 'main',
    });

    const tampered = challenge.token.slice(0, -4) + 'abcd';
    const verified = verifyPreAuthChallenge(tampered);
    expect(verified).toBeNull();
  });

  it('rejects empty or null pre-auth challenge tokens', () => {
    expect(verifyPreAuthChallenge(undefined)).toBeNull();
    expect(verifyPreAuthChallenge('')).toBeNull();
    expect(verifyPreAuthChallenge('invalid-token')).toBeNull();
  });
});
