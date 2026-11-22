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

(hasDb ? describe : describe.skip)('HTTP tenant isolation', () => {
  let app: INestApplication;
  let owner: DbPool;
  let userA: string;
  let userB: string;
  let tenantA: string;
  let tenantB: string;
  let projectB: string;

  async function seedMembership(
    userId: string,
    tenantId: string,
    role: SystemRole,
  ) {
    for (const key of PERMISSIONS) {
      await owner.query(
        `INSERT INTO permissions (key, description) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [key, key],
      );
    }
    const membership = await owner.query<{ id: string }>(
      `INSERT INTO memberships (tenant_id, user_id) VALUES ($1, $2) RETURNING id`,
      [tenantId, userId],
    );
    const roleRow = await owner.query<{ id: string }>(
      `INSERT INTO roles (tenant_id, name, system_key) VALUES ($1, $2, $2) RETURNING id`,
      [tenantId, role],
    );
    const perms = await owner.query<{ id: string; key: string }>(
      `SELECT id, key FROM permissions`,
    );
    for (const permission of ROLE_PERMISSIONS[role]) {
      const permissionId = perms.rows.find((p) => p.key === permission)?.id;
      await owner.query(
        `INSERT INTO role_permissions (tenant_id, role_id, permission_id) VALUES ($1, $2, $3)`,
        [tenantId, roleRow.rows[0]!.id, permissionId],
      );
    }
    await owner.query(
      `INSERT INTO membership_roles (tenant_id, membership_id, role_id) VALUES ($1, $2, $3)`,
      [tenantId, membership.rows[0]!.id, roleRow.rows[0]!.id],
    );
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

    userA = randomUUID();
    userB = randomUUID();
    tenantA = randomUUID();
    tenantB = randomUUID();

    await owner.query(
      `INSERT INTO users (id, issuer, subject) VALUES ($1::uuid, 'test', $2), ($3::uuid, 'test', $4)`,
      [userA, userA, userB, userB],
    );
    await owner.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, 'Company A', $2), ($3, 'Company B', $4)`,
      [tenantA, `ca-${tenantA.slice(0, 8)}`, tenantB, `cb-${tenantB.slice(0, 8)}`],
    );
    await seedMembership(userA, tenantA, 'owner');
    await seedMembership(userB, tenantB, 'owner');
    const project = await owner.query<{ id: string }>(
      `INSERT INTO projects (tenant_id, name) VALUES ($1, 'Gamma') RETURNING id`,
      [tenantB],
    );
    projectB = project.rows[0]!.id;

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

  it('rejects unauthenticated project access', async () => {
    process.env.ALLOW_TEST_AUTH = 'false';
    await request(app.getHttpServer()).get('/projects').expect(401);
    process.env.ALLOW_TEST_AUTH = 'true';
  });

  it('returns 404 when company A reads company B project', async () => {
    await request(app.getHttpServer())
      .get(`/projects/${projectB}`)
      .set('x-test-user-id', userA)
      .set('x-test-tenant-id', tenantA)
      .expect(404);
  });

  it('denies update of company B project by company A', async () => {
    await request(app.getHttpServer())
      .patch(`/projects/${projectB}`)
      .set('x-test-user-id', userA)
      .set('x-test-tenant-id', tenantA)
      .send({ name: 'hacked' })
      .expect(404);
  });

  it('denies delete of company B project by company A', async () => {
    await request(app.getHttpServer())
      .delete(`/projects/${projectB}`)
      .set('x-test-user-id', userA)
      .set('x-test-tenant-id', tenantA)
      .expect(404);
  });

  it('allows company A to create its own project', async () => {
    const res = await request(app.getHttpServer())
      .post('/projects')
      .set('x-test-user-id', userA)
      .set('x-test-tenant-id', tenantA)
      .send({ name: 'Alpha' })
      .expect(201);
    expect(res.body.name).toBe('Alpha');
  });
});
