import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { randomToken, sha256 } from '../crypto/hash';

@Injectable()
export class ApiKeysService {
  constructor(private readonly database: DatabaseService) {}

  async create(userId: string, tenantId: string | null, name: string) {
    if (!tenantId) throw new NotFoundException();
    const raw = `tg_${randomToken(24)}`;
    const keyHash = sha256(raw);
    const keyPrefix = raw.slice(0, 10);

    const row = await this.database.withTenantTransaction(
      { userId, tenantId },
      async (client) => {
        const result = await client.query(
          `
          INSERT INTO api_keys (tenant_id, name, key_hash, key_prefix, created_by)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, name, key_prefix, created_at
          `,
          [tenantId, name, keyHash, keyPrefix, userId],
        );
        return result.rows[0];
      },
    );

    return { ...row, apiKey: raw };
  }

  async list(userId: string, tenantId: string | null) {
    if (!tenantId) throw new NotFoundException();
    return this.database.withTenantTransaction(
      { userId, tenantId },
      async (client) => {
        const result = await client.query(
          `
          SELECT id, name, key_prefix, created_at, last_used_at, revoked_at
          FROM api_keys
          ORDER BY created_at DESC
          `,
        );
        return result.rows;
      },
    );
  }

  async revoke(userId: string, tenantId: string | null, id: string) {
    if (!tenantId) throw new NotFoundException();
    return this.database.withTenantTransaction(
      { userId, tenantId },
      async (client) => {
        const result = await client.query(
          `
          UPDATE api_keys
          SET revoked_at = now()
          WHERE id = $1 AND revoked_at IS NULL
          RETURNING id
          `,
          [id],
        );
        if (!result.rows[0]) throw new NotFoundException();
        return { ok: true };
      },
    );
  }
}
