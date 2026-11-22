import { randomUUID } from 'node:crypto';
import { createPool, withTenantTransaction, type DbPool } from '@tenantguard/db';

const hasDb = process.env.RUN_DB_TESTS === 'true';

(hasDb ? describe : describe.skip)('export job idempotency', () => {
  let owner: DbPool;
  let app: DbPool;

  beforeAll(() => {
    owner = createPool(
      process.env.DATABASE_URL ??
        'postgres://tenantguard:tenantguard@localhost:5432/tenantguard',
    );
    app = createPool(
      process.env.DATABASE_APP_URL ??
        'postgres://tenantguard_app:tenantguard_app@localhost:5432/tenantguard',
    );
  });

  afterAll(async () => {
    await owner.end();
    await app.end();
  });

  it('returns the same job for the same tenant idempotency key', async () => {
    const userId = randomUUID();
    const tenantId = randomUUID();
    const key = `idem-${randomUUID()}`;

    await owner.query(
      `INSERT INTO users (id, issuer, subject) VALUES ($1::uuid, 'test', $2)`,
      [userId, userId],
    );
    await owner.query(
      `INSERT INTO tenants (id, name, slug) VALUES ($1, 'Export Co', $2)`,
      [tenantId, `ex-${tenantId.slice(0, 8)}`],
    );

    const first = await withTenantTransaction(
      { userId, tenantId },
      async (client) => {
        const result = await client.query(
          `
          INSERT INTO export_jobs (tenant_id, requested_by, format, status, idempotency_key)
          VALUES ($1, $2, 'csv', 'pending', $3)
          RETURNING id
          `,
          [tenantId, userId, key],
        );
        return result.rows[0].id as string;
      },
      app,
    );

    const second = await withTenantTransaction(
      { userId, tenantId },
      async (client) => {
        const existing = await client.query(
          `SELECT id FROM export_jobs WHERE tenant_id = $1 AND idempotency_key = $2`,
          [tenantId, key],
        );
        return existing.rows[0].id as string;
      },
      app,
    );

    expect(second).toBe(first);

    const claim1 = await withTenantTransaction(
      { userId, tenantId },
      async (client) => {
        const result = await client.query(
          `
          UPDATE export_jobs
          SET status = 'processing'
          WHERE id = $1 AND status = 'pending'
          RETURNING id
          `,
          [first],
        );
        return result.rowCount;
      },
      app,
    );
    const claim2 = await withTenantTransaction(
      { userId, tenantId },
      async (client) => {
        const result = await client.query(
          `
          UPDATE export_jobs
          SET status = 'processing'
          WHERE id = $1 AND status = 'pending'
          RETURNING id
          `,
          [first],
        );
        return result.rowCount;
      },
      app,
    );

    expect(claim1).toBe(1);
    expect(claim2).toBe(0);
  });
});
