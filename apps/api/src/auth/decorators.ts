import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@tenantguard/shared';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSION_KEY = 'permission';
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);

export const TEST_AUTH_KEY = 'testAuthEnabled';
