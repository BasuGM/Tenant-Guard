import { Global, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  assertNonBypassRlsRole,
  closePool,
  createPool,
  getPool,
  setPool,
} from '@tenantguard/db';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    const url =
      process.env.DATABASE_APP_URL ??
      process.env.DATABASE_URL ??
      'postgres://tenantguard:tenantguard@localhost:5432/tenantguard';
    setPool(createPool(url));

    // M1 boots with the migration role for the health check.
    // M2+ sets DATABASE_APP_URL to tenantguard_app and enforces non-bypass.
    if (process.env.DATABASE_APP_URL) {
      await assertNonBypassRlsRole(getPool());
    }
  }

  async onModuleDestroy(): Promise<void> {
    await closePool();
  }
}
