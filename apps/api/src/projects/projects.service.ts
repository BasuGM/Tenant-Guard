import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateProjectInput, UpdateProjectInput } from '@tenantguard/shared';
import { DatabaseService } from '../database/database.service';

type ProjectRow = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class ProjectsService {
  constructor(private readonly database: DatabaseService) {}

  private ensureTenant(tenantId: string | null | undefined): string {
    if (!tenantId) throw new NotFoundException();
    return tenantId;
  }

  async list(userId: string, tenantId: string | null, systemRoles: string[]) {
    const tid = this.ensureTenant(tenantId);
    return this.database.withTenantTransaction(
      { userId, tenantId: tid },
      async (client) => {
        const isPrivileged =
          systemRoles.includes('owner') || systemRoles.includes('admin');
        if (isPrivileged) {
          const result = await client.query<ProjectRow>(
            `SELECT * FROM projects ORDER BY created_at DESC`,
          );
          return result.rows;
        }
        const result = await client.query<ProjectRow>(
          `
          SELECT p.*
          FROM projects p
          INNER JOIN project_members pm ON pm.project_id = p.id
          INNER JOIN memberships m ON m.id = pm.membership_id
          WHERE m.user_id = $1 AND m.deactivated_at IS NULL
          ORDER BY p.created_at DESC
          `,
          [userId],
        );
        return result.rows;
      },
    );
  }

  async get(
    userId: string,
    tenantId: string | null,
    projectId: string,
    systemRoles: string[],
  ) {
    const tid = this.ensureTenant(tenantId);
    return this.database.withTenantTransaction(
      { userId, tenantId: tid },
      async (client) => {
        const isPrivileged =
          systemRoles.includes('owner') || systemRoles.includes('admin');
        const result = isPrivileged
          ? await client.query<ProjectRow>(
              `SELECT * FROM projects WHERE id = $1`,
              [projectId],
            )
          : await client.query<ProjectRow>(
              `
              SELECT p.*
              FROM projects p
              INNER JOIN project_members pm ON pm.project_id = p.id
              INNER JOIN memberships m ON m.id = pm.membership_id
              WHERE p.id = $1 AND m.user_id = $2 AND m.deactivated_at IS NULL
              `,
              [projectId, userId],
            );
        const row = result.rows[0];
        if (!row) throw new NotFoundException();
        return row;
      },
    );
  }

  async create(
    userId: string,
    tenantId: string | null,
    membershipId: string | null,
    input: CreateProjectInput,
  ) {
    const tid = this.ensureTenant(tenantId);
    return this.database.withTenantTransaction(
      { userId, tenantId: tid },
      async (client) => {
        const result = await client.query<ProjectRow>(
          `
          INSERT INTO projects (tenant_id, name, description, created_by)
          VALUES ($1, $2, $3, $4)
          RETURNING *
          `,
          [tid, input.name, input.description ?? null, userId],
        );
        const project = result.rows[0]!;
        if (membershipId) {
          await client.query(
            `
            INSERT INTO project_members (tenant_id, project_id, membership_id)
            VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING
            `,
            [tid, project.id, membershipId],
          );
        }
        return project;
      },
    );
  }

  async update(
    userId: string,
    tenantId: string | null,
    projectId: string,
    input: UpdateProjectInput,
    systemRoles: string[],
  ) {
    // Visibility check first (404 for cross-tenant)
    await this.get(userId, tenantId, projectId, systemRoles);
    const tid = this.ensureTenant(tenantId);
    return this.database.withTenantTransaction(
      { userId, tenantId: tid },
      async (client) => {
        const result = await client.query<ProjectRow>(
          `
          UPDATE projects
          SET
            name = COALESCE($2, name),
            description = COALESCE($3, description),
            updated_at = now()
          WHERE id = $1
          RETURNING *
          `,
          [projectId, input.name ?? null, input.description ?? null],
        );
        const row = result.rows[0];
        if (!row) throw new NotFoundException();
        return row;
      },
    );
  }

  async remove(
    userId: string,
    tenantId: string | null,
    projectId: string,
    systemRoles: string[],
  ) {
    await this.get(userId, tenantId, projectId, systemRoles);
    const tid = this.ensureTenant(tenantId);
    return this.database.withTenantTransaction(
      { userId, tenantId: tid },
      async (client) => {
        const result = await client.query(
          `DELETE FROM projects WHERE id = $1 RETURNING id`,
          [projectId],
        );
        if (!result.rows[0]) throw new NotFoundException();
        return { ok: true };
      },
    );
  }
}
