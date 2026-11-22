import pg from 'pg';

const { Pool } = pg;

export type DbPool = pg.Pool;
export type DbClient = pg.PoolClient;

let pool: DbPool | undefined;

export function createPool(connectionString: string): DbPool {
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
}

export function getPool(): DbPool {
  if (!pool) {
    const url = process.env.DATABASE_APP_URL ?? process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_APP_URL or DATABASE_URL is required');
    }
    pool = createPool(url);
  }
  return pool;
}

export function setPool(next: DbPool | undefined): void {
  pool = next;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

export async function assertNonBypassRlsRole(
  client: DbClient | DbPool,
): Promise<void> {
  const result = await client.query<{
    current_user: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
  }>(`
    SELECT
      current_user,
      r.rolsuper,
      r.rolbypassrls
    FROM pg_roles r
    WHERE r.rolname = current_user
  `);

  const row = result.rows[0];
  if (!row) {
    throw new Error('Unable to resolve current database role');
  }

  if (row.rolsuper || row.rolbypassrls) {
    throw new Error(
      `Unsafe database role "${row.current_user}": runtime must not use SUPERUSER or BYPASSRLS`,
    );
  }
}
