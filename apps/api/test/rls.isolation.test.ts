import {
  createPool,
  withTenantTransaction,
  type DbPool,
} from '@tenantguard/db';
import { randomUUID } from 'node:crypto';

const ownerUrl =
  process.env.DATABASE_URL ??
  'postgres://tenantguard:tenantguard@localhost:5432/tenantguard';
const appUrl =
  process.env.DATABASE_APP_URL ??
  'postgres://tenantguard_app:tenantguard_app@localhost:5432/tenantguard';

const hasDb = process.env.RUN_DB_TESTS === 'true';

(hasDb ? describe : describe.skip)('PostgreSQL RLS isolation', () => {
  let owner: DbPool;
  let app: DbPool;
  let tenantA: string;
  let tenantB: string;
  let projectA: string;
  let projectB: string;
  let userA: string;

  beforeAll(async () => {
    owner = createPool(ownerUrl);
    app = createPool(appUrl);
    userA = randomUUID();
    tenantA = randomUUID();
    tenantB = randomUUID();

    await owner.query(
      `INSERT INTO users (id, issuer, subject, email) VALUES ($1::uuid, 'test', $2, 'a@example.test')`,
      [userA, userA],
    );
    await owner.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, 'A', $2)`, [
      tenantA,
      `a-${tenantA.slice(0, 8)}`,
    ]);
    await owner.query(`INSERT INTO tenants (id, name, slug) VALUES ($1, 'B', $2)`, [
      tenantB,
      `b-${tenantB.slice(0, 8)}`,
    ]);

    projectA = (
      await withTenantTransaction(
        { userId: userA, tenantId: tenantA },
        async (client) => {
          const result = await client.query<{ id: string }>(
            `INSERT INTO projects (tenant_id, name) VALUES ($1, 'Alpha') RETURNING id`,
            [tenantA],
          );
          return result.rows[0]!.id;
        },
        app,
      )
    );

    projectB = (
      await withTenantTransaction(
        { userId: userA, tenantId: tenantB },
        async (client) => {
          const result = await client.query<{ id: string }>(
            `INSERT INTO projects (tenant_id, name) VALUES ($1, 'Gamma') RETURNING id`,
            [tenantB],
          );
          return result.rows[0]!.id;
        },
        app,
      )
    );
  });

  afterAll(async () => {
    await owner.end();
    await app.end();
  });

  it('returns own project under tenant A', async () => {
    const rows = await withTenantTransaction(
      { userId: userA, tenantId: tenantA },
      async (client) => {
        const result = await client.query(`SELECT id FROM projects WHERE id = $1`, [
          projectA,
        ]);
        return result.rows;
      },
      app,
    );
    expect(rows).toHaveLength(1);
  });

  it('hides company B project from tenant A context', async () => {
    const rows = await withTenantTransaction(
      { userId: userA, tenantId: tenantA },
      async (client) => {
        const result = await client.query(`SELECT id FROM projects WHERE id = $1`, [
          projectB,
        ]);
        return result.rows;
      },
      app,
    );
    expect(rows).toHaveLength(0);
  });

  it('fails closed when app.tenant_id is missing', async () => {
    const client = await app.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`SELECT id FROM projects`);
      expect(result.rows).toHaveLength(0);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('rejects insert with foreign tenant_id via WITH CHECK', async () => {
    await expect(
      withTenantTransaction(
        { userId: userA, tenantId: tenantA },
        async (client) => {
          await client.query(
            `INSERT INTO projects (tenant_id, name) VALUES ($1, 'leak')`,
            [tenantB],
          );
        },
        app,
      ),
    ).rejects.toThrow();
  });
});
