export const KDS_ROLE_LIST = [
  'deep_fryer',
  'grill_fryer',
  'biryani_master',
  'brewer',
  'manager',
  'admin',
  'owner',
] as const;

const KDS_ROLES = new Set<string>(KDS_ROLE_LIST);
const ALL_STATION_ROLES = new Set(['manager', 'admin', 'owner']);
const STATION_ACCESS: Record<string, Set<string>> = {
  deep_fryer: new Set(['FRYER', 'DEEP FRYER']),
  grill_fryer: new Set(['GRILLED OR STEAMED', 'GRILL', 'STEAMER']),
  biryani_master: new Set(['FASTFOOD & BIRYANI', 'BIRYANI']),
  brewer: new Set(['BREWER', 'BARISTA', 'BEVERAGE', 'BEVERAGES']),
};

export function isKdsRole(role: string): boolean {
  return KDS_ROLES.has(role);
}

export function canAccessKdsStation(role: string, station: unknown): boolean {
  if (ALL_STATION_ROLES.has(role)) return true;
  const normalizedStation = typeof station === 'string' ? station.trim().toUpperCase() : '';
  return Boolean(normalizedStation && STATION_ACCESS[role]?.has(normalizedStation));
}
