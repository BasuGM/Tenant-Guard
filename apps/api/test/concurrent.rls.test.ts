import { randomUUID } from 'node:crypto';
import { createPool, withTenantTransaction, type DbPool } from '@tenantguard/db';

const hasDb = process.env.RUN_DB_TESTS === 'true';

(hasDb ? describe : describe.skip)('concurrent tenant pool isolation', () => {
  let owner: DbPool;
  let app: DbPool;

  beforeAll(async () => {
    owner = createPool(
      process.env.DATABASE_URL ??
        'postgres://tenantguard:tenantguard@localhost:5432/tenantguard',
    );
    app = createPool(
      process.env.DATABASE_APP_URL ??
        'postgres://tenantguard_app:tenantguard_app@localhost:5432/tenantguard',
    );
    // Keep pool small to force connection reuse.
    await app.query('SELECT 1');
  });

  afterAll(async () => {
    await owner.end();
    await app.end();
  });

  it('does not leak rows across overlapping tenants', async () => {
    const user = randomUUID();
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    await owner.query(
      `INSERT INTO users (id, issuer, subject) VALUES ($1::uuid, 'test', $2)`,
      [user, user],
    );
    await owner.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, 'A', $2), ($3, 'B', $4)`,
      [tenantA, `ca-${tenantA.slice(0, 8)}`, tenantB, `cb-${tenantB.slice(0, 8)}`],
    );

    await Promise.all([
      withTenantTransaction(
        { userId: user, tenantId: tenantA },
        async (client) => {
          await client.query(
            `INSERT INTO projects (tenant_id, name) VALUES ($1, 'A1')`,
            [tenantA],
          );
        },
        app,
      ),
      withTenantTransaction(
        { userId: user, tenantId: tenantB },
        async (client) => {
          await client.query(
            `INSERT INTO projects (tenant_id, name) VALUES ($1, 'B1')`,
            [tenantB],
          );
        },
        app,
      ),
    ]);

    const reads = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        withTenantTransaction(
          { userId: user, tenantId: i % 2 === 0 ? tenantA : tenantB },
          async (client) => {
            const result = await client.query<{ name: string }>(
              `SELECT name FROM projects`,
            );
            return {
              tenant: i % 2 === 0 ? 'A' : 'B',
              names: result.rows.map((r) => r.name),
            };
          },
          app,
        ),
      ),
    );

    for (const read of reads) {
      if (read.tenant === 'A') {
        expect(read.names.every((n) => n.startsWith('A'))).toBe(true);
        expect(read.names.some((n) => n.startsWith('B'))).toBe(false);
      } else {
        expect(read.names.every((n) => n.startsWith('B'))).toBe(true);
        expect(read.names.some((n) => n.startsWith('A'))).toBe(false);
      }
    }
  });
});
