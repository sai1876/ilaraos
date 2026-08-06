import { describe, expect, it } from 'vitest';
import {
  decryptField,
  decodeFieldEncryptionKey,
  encryptField,
  getFieldEncryptionKey,
  hashPasscode,
  verifyPasscode,
} from '@/server/crypto/fieldEncryption';
import {
  analyzeOutletEvidence,
  buildMoneyMigrationPatch,
  buildOutletAliasMap,
  calculateOrderItemSubtotalPaise,
  resolveCanonicalOutletId,
  stockMovementBalances,
} from '@/server/database/canonicalMigration';
import { readCanonicalMoneyPaise } from '@/server/database/canonicalMoney';

describe('sensitive field encryption', () => {
  const key = Buffer.alloc(32, 7);

  it('round-trips with authenticated document and field context', () => {
    const envelope = encryptField([0.12, 0.99], key, 'staff_private:staff-1:face_descriptor', 'v3');
    expect(decryptField<number[]>(envelope, key, 'staff_private:staff-1:face_descriptor')).toEqual([0.12, 0.99]);
    expect(envelope.key_version).toBe('v3');
  });

  it('rejects ciphertext moved to another field context', () => {
    const envelope = encryptField('SECRET', key, 'admin_secrets:user-1:secret');
    expect(() => decryptField(envelope, key, 'admin_secrets:user-2:secret')).toThrow();
  });

  it('accepts only a base64 32-byte key', () => {
    expect(decodeFieldEncryptionKey(key.toString('base64'))).toEqual(key);
    expect(() => decodeFieldEncryptionKey(Buffer.alloc(16).toString('base64'))).toThrow();
  });

  it('stores staff passcodes as salted scrypt hashes', () => {
    const pepper = 'test-only-pepper-with-at-least-32-bytes';
    const stored = hashPasscode('7410', Buffer.alloc(16, 2), pepper);
    expect(stored.hash).not.toContain('7410');
    expect(verifyPasscode('7410', stored, pepper)).toBe(true);
    expect(verifyPasscode('7411', stored, pepper)).toBe(false);
    expect(verifyPasscode('7410', { ...stored, cost: 2 ** 20 }, pepper)).toBe(false);
  });

  it('resolves historical encryption keys by envelope version', () => {
    const previousKeyring = process.env.STAFF_PRIVATE_ENCRYPTION_KEYS;
    const previousVersion = process.env.STAFF_PRIVATE_KEY_VERSION;
    process.env.STAFF_PRIVATE_KEY_VERSION = 'v2';
    process.env.STAFF_PRIVATE_ENCRYPTION_KEYS = JSON.stringify({
      v1: Buffer.alloc(32, 1).toString('base64'),
      v2: Buffer.alloc(32, 2).toString('base64'),
    });
    try {
      expect(getFieldEncryptionKey('v1')).toEqual(Buffer.alloc(32, 1));
      expect(getFieldEncryptionKey('v2')).toEqual(Buffer.alloc(32, 2));
    } finally {
      if (previousKeyring === undefined) delete process.env.STAFF_PRIVATE_ENCRYPTION_KEYS;
      else process.env.STAFF_PRIVATE_ENCRYPTION_KEYS = previousKeyring;
      if (previousVersion === undefined) delete process.env.STAFF_PRIVATE_KEY_VERSION;
      else process.env.STAFF_PRIVATE_KEY_VERSION = previousVersion;
    }
  });
});

describe('canonical database migration helpers', () => {
  it('maps outlet IDs, names, and hatches to one canonical ID', () => {
    const aliases = buildOutletAliasMap([{
      id: 'oasis-doc',
      data: { outlet_id: 'oasis', name: 'Oasis Hub', hatches: ['North Hatch'] },
    }]);
    expect(resolveCanonicalOutletId([' OASIS HUB '], aliases)).toBe('oasis');
    expect(resolveCanonicalOutletId(['north hatch'], aliases)).toBe('oasis');
    const second = buildOutletAliasMap([
      { id: 'one', data: { outlet_id: 'one', name: 'One' } },
      { id: 'two', data: { outlet_id: 'two', name: 'Two' } },
    ]);
    expect(analyzeOutletEvidence(['one', 'two'], second)).toEqual({
      outletId: null,
      conflict: true,
      unresolvedEvidence: false,
    });
  });

  it('blocks two outlet documents from declaring one canonical ID', () => {
    expect(() => buildOutletAliasMap([
      { id: 'outlet-doc-a', data: { outlet_id: 'shared-outlet' } },
      { id: 'outlet-doc-b', data: { outlet_id: 'shared-outlet' } },
    ])).toThrow('Duplicate canonical outlet ID');
  });

  it('backfills integer paise without overwriting a mismatch', () => {
    expect(buildMoneyMigrationPatch('orders', {
      gross_amount: 120.55,
      items: [{ quantity: 1, unit_price: 60.25 }],
    })).toEqual({
      patch: {
        gross_amount_paise: 12055,
        items: [{ quantity: 1, unit_price: 60.25, unit_price_paise: 6025 }],
        subtotal_amount: 60.25,
        subtotal_amount_paise: 6025,
      },
      conflicts: [],
    });
    expect(buildMoneyMigrationPatch('payment_ledger', {
      amount: 10,
      amount_paise: 999,
    })).toEqual({ patch: {}, conflicts: ['amount_paise'] });
    expect(buildMoneyMigrationPatch('payment_ledger', { amount: '10.00' })).toEqual({
      patch: {},
      conflicts: ['amount_paise'],
    });
  });

  it('reconciles order item totals and legacy inventory unit cost', () => {
    expect(calculateOrderItemSubtotalPaise({
      items: [
        { quantity: 2, unit_price: 10.25 },
        { quantity: 1, unit_price_paise: 500 },
      ],
    })).toBe(2550);
    expect(buildMoneyMigrationPatch('orders', {
      gross_amount: 25.5,
      items: [{ quantity: 2, unit_price: 12.75 }],
    })).toEqual({
      patch: {
        gross_amount_paise: 2550,
        items: [{ quantity: 2, unit_price: 12.75, unit_price_paise: 1275 }],
        subtotal_amount: 25.5,
        subtotal_amount_paise: 2550,
      },
      conflicts: [],
    });
    expect(buildMoneyMigrationPatch('orders', {
      subtotal_amount: 20,
      items: [{ quantity: 2, unit_price: 12.75 }],
    }).conflicts).toContain('subtotal_amount_paise:item_total');
    expect(buildMoneyMigrationPatch('inventory', { unit_cost: 7.25 })).toEqual({
      patch: { cost_per_unit: 7.25, cost_per_unit_paise: 725 },
      conflicts: [],
    });
  });

  it('detects impossible stock movement arithmetic', () => {
    expect(stockMovementBalances({ previous_quantity: 10, quantity_delta: -3, new_quantity: 7 })).toBe(true);
    expect(stockMovementBalances({ previous_quantity: 10, quantity_delta: -3, new_quantity: 8 })).toBe(false);
  });

  it('prefers integer paise and rejects split-brain monetary fields', () => {
    expect(readCanonicalMoneyPaise({ amount: 10.25, amount_paise: 1025 }, 'amount', 'amount_paise')).toBe(1025);
    expect(readCanonicalMoneyPaise({ amount: 10.25 }, 'amount', 'amount_paise')).toBe(1025);
    expect(() => readCanonicalMoneyPaise({ amount: 10.25, amount_paise: 1024 }, 'amount', 'amount_paise')).toThrow();
    expect(() => readCanonicalMoneyPaise({ amount: '10.25' }, 'amount', 'amount_paise')).toThrow();
    expect(() => readCanonicalMoneyPaise({ amount: true }, 'amount', 'amount_paise')).toThrow();
    expect(() => readCanonicalMoneyPaise({ amount: 1.001 }, 'amount', 'amount_paise')).toThrow();
  });
});
