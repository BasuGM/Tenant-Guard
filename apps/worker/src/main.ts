import {
  assertNonBypassRlsRole,
  createPool,
  setPool,
  getPool,
  closePool,
} from '@tenantguard/db';
import { startWorker } from './worker.js';

async function main(): Promise<void> {
  const url =
    process.env.DATABASE_APP_URL ??
    process.env.DATABASE_URL ??
    'postgres://tenantguard_app:tenantguard_app@localhost:5432/tenantguard';
  setPool(createPool(url));
  await assertNonBypassRlsRole(getPool());

  const stop = await startWorker();
  const shutdown = async () => {
    stop();
    await closePool();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(async (error) => {
  console.error(error);
  await closePool();
  process.exit(1);
});
