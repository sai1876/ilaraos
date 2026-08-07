import {
  KDS_ROLES,
  canAccessKdsStation,
  isKdsRole,
} from '@/lib/auth/roles';

export const KDS_ROLE_LIST = Array.from(KDS_ROLES);

export { isKdsRole, canAccessKdsStation };
