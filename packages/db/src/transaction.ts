import type { DbClient, DbPool } from './pool';
import { getPool } from './pool';

export type TenantContext = {
  userId: string;
  tenantId: string;
};

export async function withTenantTransaction<T>(
  context: TenantContext,
  fn: (client: DbClient) => Promise<T>,
  pool: DbPool = getPool(),
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [
      context.userId,
    ]);
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
      context.tenantId,
    ]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function withClient<T>(
  fn: (client: DbClient) => Promise<T>,
  pool: DbPool = getPool(),
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
