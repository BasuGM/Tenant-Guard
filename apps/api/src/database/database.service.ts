import { Injectable } from '@nestjs/common';
import {
  checkDatabase,
  getPool,
  withClient,
  withTenantTransaction,
  type DbClient,
  type TenantContext,
} from '@tenantguard/db';

@Injectable()
export class DatabaseService {
  async health(): Promise<{ ok: true }> {
    return checkDatabase(getPool());
  }

  withTenantTransaction<T>(
    context: TenantContext,
    fn: (client: DbClient) => Promise<T>,
  ): Promise<T> {
    return withTenantTransaction(context, fn);
  }

  withClient<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
    return withClient(fn);
  }

  pool() {
    return getPool();
  }
}
