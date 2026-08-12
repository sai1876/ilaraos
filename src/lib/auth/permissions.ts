export const PERMISSIONS = {
  CASH_SESSIONS_READ: 'cash_sessions.read',
  CASH_SESSIONS_CREATE: 'cash_sessions.create',
  CASH_SESSIONS_CLOSE: 'cash_sessions.close',
  EXPENSES_READ: 'expenses.read',
  EXPENSES_CREATE: 'expenses.create',
  INVENTORY_ADJUST: 'inventory.adjust',
  INVENTORY_DELETE: 'inventory.delete',
  INVENTORY_MANAGE: 'inventory.manage',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

const MANAGER_DEFAULT_PERMISSIONS: string[] = [
  PERMISSIONS.CASH_SESSIONS_READ,
  PERMISSIONS.CASH_SESSIONS_CREATE,
  PERMISSIONS.CASH_SESSIONS_CLOSE,
  PERMISSIONS.EXPENSES_READ,
  PERMISSIONS.EXPENSES_CREATE,
];

/**
 * Returns safe default permissions for a role, ensuring least privilege.
 * Owner and Admin implicitly bypass permission checks in `requirePermission`,
 * so they don't explicitly need granular lists here to function.
 * Kitchen roles and Rider roles must not receive inventory or cash permissions.
 */
export function getDefaultPermissionsForRole(role: string): string[] {
  const normalized = role.toLowerCase();
  
  if (normalized === 'manager') {
    return [...MANAGER_DEFAULT_PERMISSIONS];
  }
  
  // Kitchen roles, rider, staff, etc. receive no implicit granular permissions
  return [];
}
