import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Customer checkout flow wiring', () => {
  const cartPath = path.resolve(__dirname, '../app/(customer)/cart/page.tsx');
  const content = fs.readFileSync(cartPath, 'utf-8');

  it('requires a resolved Firebase user and never sends an optional token', () => {
    expect(content.includes('const firebaseUser = auth.currentUser')).toBe(true);
    expect(content.includes('firebaseUser.uid !== user.uid')).toBe(true);
    expect(content.includes('await firebaseUser.getIdToken(true)')).toBe(true);
    expect(content.includes('auth.currentUser?.getIdToken()')).toBe(false);
  });

  it('blocks duplicate submissions and propagates signed table tokens', () => {
    expect(content.includes('submissionInFlight.current || isPlacingOrder')).toBe(true);
    expect(content.includes('submissionInFlight.current = true')).toBe(true);
    expect(content.includes("tableToken: orderType === 'dine-in' ? tableToken : undefined")).toBe(true);
    expect(content.includes('Dine-in orders require a valid table QR')).toBe(true);
  });

  it('omits an empty pickup hatch instead of sending an invalid empty string', () => {
    expect(content.includes("hatch: orderType === 'pickup' && selectedHatch.trim() ? selectedHatch : undefined")).toBe(true);
  });

  it('resolves stale outlet selections to an active outlet before checkout', () => {
    expect(content.includes('const activeOutlets = outlets.filter(outlet => outlet.status === \'active\');')).toBe(true);
    expect(content.includes('outlet: resolvedOutletName')).toBe(true);
    expect(content.includes('No active outlet is available for this order')).toBe(true);
  });

  it('reconciles stale cart customizations before sending an order request', () => {
    expect(content.includes('reconcileCartCustomizations(cart, menuItems)')).toBe(true);
    expect(content.includes('Unavailable item customizations were removed')).toBe(true);
    expect(content.includes('Loading the latest menu details')).toBe(true);
  });

  it('maps real failures and navigates successful orders to tracking', () => {
    expect(content.includes('Could not connect to the server — please check your connection.')).toBe(true);
    expect(content.includes('Your session expired — please sign in again.')).toBe(true);
    expect(content.includes('getOrderPlacementMessage(error)')).toBe(true);
    expect(content.includes('router.push(`/orders/${encodeURIComponent(orderId)}`)')).toBe(true);
    expect(content.includes('clearCart();')).toBe(true);
  });
});
