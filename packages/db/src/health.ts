import type { DbPool } from './pool';

export async function checkDatabase(pool: DbPool): Promise<{ ok: true }> {
  const result = await pool.query('SELECT 1 AS ok');
  if (result.rows[0]?.ok !== 1) {
    throw new Error('Database health check failed');
  }
  return { ok: true };
}
