import type { Permission } from '@tenantguard/shared';

export type AuthUser = {
  id: string;
  email: string | null;
  displayName: string | null;
};

export type RequestAuth = {
  user: AuthUser;
  sessionId: string;
  tenantId: string | null;
  membershipId: string | null;
  permissions: Permission[];
  systemRoles: string[];
};
