export const PERMISSIONS = [
  'projects:read',
  'projects:create',
  'projects:update',
  'projects:delete',
  'members:invite',
  'members:read',
  'members:update',
  'members:deactivate',
  'roles:manage',
  'billing:manage',
  'exports:create',
  'exports:read',
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const SYSTEM_ROLES = [
  'owner',
  'admin',
  'manager',
  'member',
  'viewer',
] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const ROLE_PERMISSIONS: Record<SystemRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter((p) => p !== 'billing:manage'),
  manager: ['projects:read', 'projects:create', 'projects:update'] as const,
  member: ['projects:read', 'projects:create', 'projects:update'] as const,
  viewer: ['projects:read'] as const,
};
