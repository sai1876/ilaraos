/**
 * Central Role Matrix for ILARA OS Authentication and Authorization.
 * Server and Client Safe.
 */

export const CANONICAL_ROLES = [
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
] as const;

export type StaffRole = Exclude<typeof CANONICAL_ROLES[number], 'customer'>;
export type Role = typeof CANONICAL_ROLES[number];

export const MANAGEMENT_ROLES = new Set<string>(['owner', 'admin', 'manager']);
export const KITCHEN_ROLES = new Set<string>([
  'kitchen',
  'chef',
  'deep_fryer',
  'grill_fryer',
  'biryani_master',
  'brewer',
]);
export const STATION_ROLES = new Set<string>([
  'deep_fryer',
  'grill_fryer',
  'biryani_master',
  'brewer',
]);
export const DELIVERY_ROLES = new Set<string>(['rider']);

export const KDS_ROLES = new Set<string>([
  'deep_fryer',
  'grill_fryer',
  'biryani_master',
  'brewer',
  'chef',
  'kitchen',
  'manager',
  'admin',
  'owner',
]);

export const STAFF_ROLES = new Set<string>([
  'staff',
  'manager',
  'admin',
  'owner',
  'rider',
  'kitchen',
  'chef',
  'deep_fryer',
  'grill_fryer',
  'biryani_master',
  'brewer',
]);

export const STATION_ACCESS: Record<string, string[]> = {
  deep_fryer: ['FRYER', 'DEEP FRYER'],
  grill_fryer: ['GRILLED OR STEAMED', 'GRILL', 'STEAMER'],
  biryani_master: ['FASTFOOD & BIRYANI', 'BIRYANI'],
  brewer: ['BREWER', 'BARISTA', 'BEVERAGE', 'BEVERAGES'],
};

/**
 * Checks if a given role can access items assigned to a specific KDS station.
 */
export function canAccessKdsStation(role: string, station: unknown): boolean {
  if (role === 'owner' || role === 'admin' || role === 'manager' || role === 'chef' || role === 'kitchen') {
    return true;
  }
  const normalizedStation = typeof station === 'string' ? station.trim().toUpperCase() : '';
  if (!normalizedStation) return false;

  const allowedStations = STATION_ACCESS[role];
  if (!allowedStations) return false;

  return allowedStations.includes(normalizedStation);
}

/**
 * Checks if a role is permitted access to KDS feed/page.
 */
export function isKdsRole(role: string): boolean {
  return KDS_ROLES.has(role);
}

/**
 * Standard Home Route mapping for every canonical role.
 */
export function getHomeRouteForRole(role: string): string {
  switch (role) {
    case 'owner':
    case 'admin':
      return '/operations';
    case 'manager':
      return '/manager';
    case 'kitchen':
    case 'chef':
    case 'deep_fryer':
    case 'grill_fryer':
    case 'biryani_master':
    case 'brewer':
      return '/kds';
    case 'rider':
      return '/delivery';
    case 'staff':
      return '/staff';
    case 'customer':
    default:
      return '/';
  }
}
