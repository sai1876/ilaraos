import { describe, it, expect } from 'vitest';
import {
  CANONICAL_ROLES,
  getHomeRouteForRole,
  canAccessKdsStation,
  isKdsRole,
  STAFF_ROLES,
  KITCHEN_ROLES,
  MANAGEMENT_ROLES,
  STATION_ROLES,
  DELIVERY_ROLES,
} from '@/lib/auth/roles';

describe('Staff Auth Canonical Role Matrix', () => {
  it('contains exactly the 12 canonical roles', () => {
    expect(CANONICAL_ROLES).toEqual([
      'customer',
      'owner',
      'admin',
      'manager',
      'staff',
      'kitchen',
      'chef',
      'deep_fryer',
      'grill_fryer',
      'biryani_master',
      'brewer',
      'rider',
    ]);
  });

  it('correctly maps getHomeRouteForRole for every role', () => {
    expect(getHomeRouteForRole('owner')).toBe('/operations');
    expect(getHomeRouteForRole('admin')).toBe('/operations');
    expect(getHomeRouteForRole('manager')).toBe('/manager');
    expect(getHomeRouteForRole('staff')).toBe('/staff');
    expect(getHomeRouteForRole('kitchen')).toBe('/kds');
    expect(getHomeRouteForRole('chef')).toBe('/kds');
    expect(getHomeRouteForRole('deep_fryer')).toBe('/kds');
    expect(getHomeRouteForRole('grill_fryer')).toBe('/kds');
    expect(getHomeRouteForRole('biryani_master')).toBe('/kds');
    expect(getHomeRouteForRole('brewer')).toBe('/kds');
    expect(getHomeRouteForRole('rider')).toBe('/delivery');
    expect(getHomeRouteForRole('customer')).toBe('/');
  });

  it('identifies KDS roles correctly', () => {
    const kdsRoles = ['deep_fryer', 'grill_fryer', 'biryani_master', 'brewer', 'chef', 'kitchen', 'manager', 'admin', 'owner'];
    kdsRoles.forEach((role) => {
      expect(isKdsRole(role)).toBe(true);
    });

    expect(isKdsRole('staff')).toBe(false);
    expect(isKdsRole('rider')).toBe(false);
    expect(isKdsRole('customer')).toBe(false);
  });

  it('enforces station access policy strictly', () => {
    // Global access roles
    ['owner', 'admin', 'manager', 'chef', 'kitchen'].forEach((role) => {
      expect(canAccessKdsStation(role, 'FRYER')).toBe(true);
      expect(canAccessKdsStation(role, 'BIRYANI')).toBe(true);
      expect(canAccessKdsStation(role, 'BREWER')).toBe(true);
      expect(canAccessKdsStation(role, 'GRILL')).toBe(true);
    });

    // Station specific roles
    expect(canAccessKdsStation('deep_fryer', 'FRYER')).toBe(true);
    expect(canAccessKdsStation('deep_fryer', 'DEEP FRYER')).toBe(true);
    expect(canAccessKdsStation('deep_fryer', 'BIRYANI')).toBe(false);

    expect(canAccessKdsStation('grill_fryer', 'GRILLED OR STEAMED')).toBe(true);
    expect(canAccessKdsStation('grill_fryer', 'GRILL')).toBe(true);
    expect(canAccessKdsStation('grill_fryer', 'STEAMER')).toBe(true);
    expect(canAccessKdsStation('grill_fryer', 'FRYER')).toBe(false);

    expect(canAccessKdsStation('biryani_master', 'FASTFOOD & BIRYANI')).toBe(true);
    expect(canAccessKdsStation('biryani_master', 'BIRYANI')).toBe(true);
    expect(canAccessKdsStation('biryani_master', 'BARISTA')).toBe(false);

    expect(canAccessKdsStation('brewer', 'BREWER')).toBe(true);
    expect(canAccessKdsStation('brewer', 'BARISTA')).toBe(true);
    expect(canAccessKdsStation('brewer', 'BEVERAGE')).toBe(true);
    expect(canAccessKdsStation('brewer', 'BEVERAGES')).toBe(true);
    expect(canAccessKdsStation('brewer', 'FRYER')).toBe(false);

    // Non-kitchen roles
    expect(canAccessKdsStation('staff', 'FRYER')).toBe(false);
    expect(canAccessKdsStation('rider', 'BEVERAGE')).toBe(false);
    expect(canAccessKdsStation('customer', 'BIRYANI')).toBe(false);
  });

  it('validates role set groupings', () => {
    expect(STAFF_ROLES.has('customer')).toBe(false);
    expect(STAFF_ROLES.has('staff')).toBe(true);
    expect(STAFF_ROLES.has('deep_fryer')).toBe(true);

    expect(KITCHEN_ROLES.has('chef')).toBe(true);
    expect(KITCHEN_ROLES.has('manager')).toBe(false);

    expect(MANAGEMENT_ROLES.has('owner')).toBe(true);
    expect(MANAGEMENT_ROLES.has('admin')).toBe(true);
    expect(MANAGEMENT_ROLES.has('manager')).toBe(true);
    expect(MANAGEMENT_ROLES.has('staff')).toBe(false);

    expect(STATION_ROLES.has('deep_fryer')).toBe(true);
    expect(STATION_ROLES.has('rider')).toBe(false);

    expect(DELIVERY_ROLES.has('rider')).toBe(true);
  });
});
