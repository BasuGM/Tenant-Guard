import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import {
  ROLE_PERMISSIONS,
  PERMISSIONS,
  type SystemRole,
} from '@tenantguard/shared';
import { createPool, type DbPool } from '@tenantguard/db';
import { AppModule } from '../src/app.module';

const hasDb = process.env.RUN_DB_TESTS === 'true';

(hasDb ? describe : describe.skip)('RBAC enforcement', () => {
  let app: INestApplication;
  let owner: DbPool;
  let tenantId: string;
  let viewerId: string;
  let memberId: string;
  let ownerId: string;
  let projectId: string;

  async function seed(userId: string, role: SystemRole) {
    for (const key of PERMISSIONS) {
      await owner.query(
        `INSERT INTO permissions (key, description) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [key, key],
      );
    }
    await owner.query(
      `INSERT INTO users (id, issuer, subject) VALUES ($1::uuid, 'test', $2) ON CONFLICT (issuer, subject) DO NOTHING`,
      [userId, userId],
    );
    const membership = await owner.query<{ id: string }>(
      `INSERT INTO memberships (tenant_id, user_id) VALUES ($1, $2)
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET deactivated_at = NULL
       RETURNING id`,
      [tenantId, userId],
    );
    let roleRow = await owner.query<{ id: string }>(
      `SELECT id FROM roles WHERE tenant_id = $1 AND system_key = $2`,
      [tenantId, role],
    );
    if (!roleRow.rows[0]) {
      roleRow = await owner.query<{ id: string }>(
        `INSERT INTO roles (tenant_id, name, system_key) VALUES ($1, $2, $2) RETURNING id`,
        [tenantId, role],
      );
      const perms = await owner.query<{ id: string; key: string }>(
        `SELECT id, key FROM permissions`,
      );
      for (const permission of ROLE_PERMISSIONS[role]) {
        await owner.query(
          `INSERT INTO role_permissions (tenant_id, role_id, permission_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [
            tenantId,
            roleRow.rows[0]!.id,
            perms.rows.find((p) => p.key === permission)?.id,
          ],
        );
      }
    }
    await owner.query(
      `INSERT INTO membership_roles (tenant_id, membership_id, role_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [tenantId, membership.rows[0]!.id, roleRow.rows[0]!.id],
    );
    return membership.rows[0]!.id;
  }

  beforeAll(async () => {
    process.env.ALLOW_TEST_AUTH = 'true';
    process.env.NODE_ENV = 'test';
    process.env.OTEL_SDK_DISABLED = 'true';
    delete process.env.REDIS_URL;
    delete process.env.OIDC_ISSUER;

    owner = createPool(
      process.env.DATABASE_URL ??
        'postgres://tenantguard:tenantguard@localhost:5432/tenantguard',
    );
    tenantId = randomUUID();
    viewerId = randomUUID();
    memberId = randomUUID();
    ownerId = randomUUID();

    await owner.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, 'RBAC Co', $2)`,
      [tenantId, `rbac-${tenantId.slice(0, 8)}`],
    );
    await seed(viewerId, 'viewer');
    await seed(memberId, 'member');
    await seed(ownerId, 'owner');
    const project = await owner.query<{ id: string }>(
      `INSERT INTO projects (tenant_id, name) VALUES ($1, 'Owned') RETURNING id`,
      [tenantId],
    );
    projectId = project.rows[0]!.id;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    await owner.end();
  });

  it('viewer create returns 403', async () => {
    await request(app.getHttpServer())
      .post('/projects')
      .set('x-test-user-id', viewerId)
      .set('x-test-tenant-id', tenantId)
      .send({ name: 'Nope' })
      .expect(403);
  });

  it('member delete returns 403', async () => {
    await request(app.getHttpServer())
      .delete(`/projects/${projectId}`)
      .set('x-test-user-id', memberId)
      .set('x-test-tenant-id', tenantId)
      .expect(403);
  });

  it('owner delete of own project returns success', async () => {
    const created = await request(app.getHttpServer())
      .post('/projects')
      .set('x-test-user-id', ownerId)
      .set('x-test-tenant-id', tenantId)
      .send({ name: 'Temp' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/projects/${created.body.id}`)
      .set('x-test-user-id', ownerId)
      .set('x-test-tenant-id', tenantId)
      .expect(200);
  });
});
