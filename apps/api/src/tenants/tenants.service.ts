import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  type CreateTenantInput,
  type SystemRole,
} from '@tenantguard/shared';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class TenantsService {
  constructor(private readonly database: DatabaseService) {}

  async create(userId: string, input: CreateTenantInput) {
    const tenantId = randomUUID();

    return this.database.withTenantTransaction(
      { userId, tenantId },
      async (client) => {
        const tenant = await client.query<{
          id: string;
          name: string;
          slug: string;
        }>(
          `
          INSERT INTO tenants (id, name, slug)
          VALUES ($1, $2, $3)
          RETURNING id, name, slug
          `,
          [tenantId, input.name, input.slug],
        );

        for (const key of PERMISSIONS) {
          await client.query(
            `
            INSERT INTO permissions (key, description)
            VALUES ($1, $2)
            ON CONFLICT (key) DO NOTHING
            `,
            [key, key],
          );
        }

        // permissions table has no RLS; readable globally
        const permRows = await client.query<{ id: string; key: string }>(
          `SELECT id, key FROM permissions`,
        );
        const permByKey = new Map(permRows.rows.map((p) => [p.key, p.id]));

        const roleIds = new Map<SystemRole, string>();
        for (const role of Object.keys(ROLE_PERMISSIONS) as SystemRole[]) {
          const inserted = await client.query<{ id: string }>(
            `
            INSERT INTO roles (tenant_id, name, system_key)
            VALUES ($1, $2, $3)
            RETURNING id
            `,
            [tenantId, role, role],
          );
          roleIds.set(role, inserted.rows[0]!.id);
          for (const permission of ROLE_PERMISSIONS[role]) {
            await client.query(
              `
              INSERT INTO role_permissions (tenant_id, role_id, permission_id)
              VALUES ($1, $2, $3)
              `,
              [tenantId, roleIds.get(role), permByKey.get(permission)],
            );
          }
        }

        const membership = await client.query<{ id: string }>(
          `
          INSERT INTO memberships (tenant_id, user_id)
          VALUES ($1, $2)
          RETURNING id
          `,
          [tenantId, userId],
        );

        await client.query(
          `
          INSERT INTO membership_roles (tenant_id, membership_id, role_id)
          VALUES ($1, $2, $3)
          `,
          [tenantId, membership.rows[0]!.id, roleIds.get('owner')],
        );

        return tenant.rows[0];
      },
    );
  }

  async listForUser(userId: string) {
    return this.database.withClient(async (client) => {
      const result = await client.query(
        `SELECT * FROM app_list_my_tenants($1)`,
        [userId],
      );
      return result.rows;
    });
  }
}
