import { describe, expect, it } from 'vitest';
import { getOrderProgressIndex, getReferralProgress, getTableCheckoutHref } from '@/lib/customerExperience';

describe('customer experience route helpers', () => {
  it('maps live order statuses to the reference tracking steps', () => {
    expect(getOrderProgressIndex('pending')).toBe(0);
    expect(getOrderProgressIndex('preparing')).toBe(1);
    expect(getOrderProgressIndex('ready')).toBe(2);
    expect(getOrderProgressIndex('delivered')).toBe(3);
  });

  it('clamps referral milestone progress', () => {
    expect(getReferralProgress(5, 8)).toBe(62.5);
    expect(getReferralProgress(20, 15)).toBe(100);
    expect(getReferralProgress(-1, 5)).toBe(0);
  });

  it('preserves table identity when entering checkout', () => {
    expect(getTableCheckoutHref('Table 12')).toBe('/cart?table=Table%2012');
  });

  it('propagates the signed table token into checkout', () => {
    expect(getTableCheckoutHref('Table 12', 'signed.token/value'))
      .toBe('/cart?table=Table%2012&tableToken=signed.token%2Fvalue');
  });
});
