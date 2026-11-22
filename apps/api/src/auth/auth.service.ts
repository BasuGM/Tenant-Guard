import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Permission } from '@tenantguard/shared';
import { DatabaseService } from '../database/database.service';
import { sha256, randomToken } from '../crypto/hash';
import type { RequestAuth } from './auth.types';

type SessionRow = {
  session_id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  active_tenant_id: string | null;
  expires_at: Date;
  revoked_at: Date | null;
};

@Injectable()
export class AuthService {
  constructor(private readonly database: DatabaseService) {}

  async resolveSession(sessionId: string): Promise<RequestAuth | null> {
    const session = await this.database.withClient(async (client) => {
      const result = await client.query<SessionRow>(
        `SELECT * FROM app_get_session($1)`,
        [sessionId],
      );
      return result.rows[0] ?? null;
    });

    if (!session || session.revoked_at || session.expires_at <= new Date()) {
      return null;
    }

    let membershipId: string | null = null;
    let permissions: Permission[] = [];
    let systemRoles: string[] = [];

    if (session.active_tenant_id) {
      const membership = await this.loadMembership(
        session.user_id,
        session.active_tenant_id,
      );
      if (membership) {
        membershipId = membership.membershipId;
        permissions = membership.permissions;
        systemRoles = membership.systemRoles;
      }
    }

    return {
      user: {
        id: session.user_id,
        email: session.email,
        displayName: session.display_name,
      },
      sessionId: session.session_id,
      tenantId: session.active_tenant_id,
      membershipId,
      permissions,
      systemRoles,
    };
  }

  async buildTestAuth(
    userId: string,
    tenantId: string | null,
  ): Promise<RequestAuth> {
    const membership = tenantId
      ? await this.loadMembership(userId, tenantId)
      : null;
    return {
      user: { id: userId, email: null, displayName: null },
      sessionId: 'test-session',
      tenantId,
      membershipId: membership?.membershipId ?? null,
      permissions: membership?.permissions ?? [],
      systemRoles: membership?.systemRoles ?? [],
    };
  }

  async loadMembership(
    userId: string,
    tenantId: string,
  ): Promise<{
    membershipId: string;
    permissions: Permission[];
    systemRoles: string[];
  } | null> {
    return this.database.withClient(async (client) => {
      const result = await client.query<{
        membership_id: string;
        permissions: string[] | null;
        system_roles: string[] | null;
      }>(`SELECT * FROM app_get_membership($1, $2)`, [userId, tenantId]);
      const row = result.rows[0];
      if (!row) return null;
      return {
        membershipId: row.membership_id,
        permissions: (row.permissions ?? []) as Permission[],
        systemRoles: row.system_roles ?? [],
      };
    });
  }

  async upsertUser(input: {
    issuer: string;
    subject: string;
    email?: string | null;
    displayName?: string | null;
  }): Promise<{ id: string }> {
    return this.database.withClient(async (client) => {
      const result = await client.query<{ id: string }>(
        `
        INSERT INTO users (issuer, subject, email, display_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (issuer, subject)
        DO UPDATE SET
          email = EXCLUDED.email,
          display_name = EXCLUDED.display_name,
          updated_at = now()
        RETURNING id
        `,
        [
          input.issuer,
          input.subject,
          input.email ?? null,
          input.displayName ?? null,
        ],
      );
      return { id: result.rows[0]!.id };
    });
  }

  async createSession(userId: string, activeTenantId?: string | null) {
    const sessionId = randomUUID();
    const refreshToken = randomToken();
    const familyId = randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12);
    const refreshExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

    await this.database.withClient(async (client) => {
      await client.query(
        `
        INSERT INTO sessions (id, user_id, active_tenant_id, expires_at)
        VALUES ($1, $2, $3, $4)
        `,
        [sessionId, userId, activeTenantId ?? null, expiresAt],
      );
      await client.query(
        `
        INSERT INTO refresh_tokens
          (family_id, user_id, session_id, token_hash, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [familyId, userId, sessionId, sha256(refreshToken), refreshExpiresAt],
      );
    });

    return { sessionId, refreshToken, familyId };
  }

  async rotateRefreshToken(presentedToken: string): Promise<{
    sessionId: string;
    refreshToken: string;
  }> {
    const presentedHash = sha256(presentedToken);
    return this.database.withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const existing = await client.query<{
          id: string;
          family_id: string;
          user_id: string;
          session_id: string;
          revoked_at: Date | null;
          expires_at: Date;
        }>(
          `
          SELECT id, family_id, user_id, session_id, revoked_at, expires_at
          FROM refresh_tokens
          WHERE token_hash = $1
          FOR UPDATE
          `,
          [presentedHash],
        );
        const row = existing.rows[0];
        if (!row) {
          throw new UnauthorizedException('Invalid refresh token');
        }

        if (row.revoked_at || row.expires_at <= new Date()) {
          await client.query(
            `
            UPDATE refresh_tokens
            SET revoked_at = COALESCE(revoked_at, now())
            WHERE family_id = $1
            `,
            [row.family_id],
          );
          await client.query(
            `
            UPDATE sessions SET revoked_at = now()
            WHERE id = $1
            `,
            [row.session_id],
          );
          await client.query('COMMIT');
          throw new UnauthorizedException('Refresh token reuse detected');
        }

        await client.query(
          `UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`,
          [row.id],
        );

        const nextToken = randomToken();
        const refreshExpiresAt = new Date(
          Date.now() + 1000 * 60 * 60 * 24 * 30,
        );
        await client.query(
          `
          INSERT INTO refresh_tokens
            (family_id, user_id, session_id, token_hash, parent_id, expires_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            row.family_id,
            row.user_id,
            row.session_id,
            sha256(nextToken),
            row.id,
            refreshExpiresAt,
          ],
        );
        await client.query('COMMIT');
        return { sessionId: row.session_id, refreshToken: nextToken };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  async logout(sessionId: string): Promise<void> {
    await this.database.withClient(async (client) => {
      await client.query(
        `UPDATE sessions SET revoked_at = now() WHERE id = $1`,
        [sessionId],
      );
      await client.query(
        `
        UPDATE refresh_tokens
        SET revoked_at = now()
        WHERE session_id = $1 AND revoked_at IS NULL
        `,
        [sessionId],
      );
    });
  }

  async switchTenant(sessionId: string, userId: string, tenantId: string) {
    const membership = await this.loadMembership(userId, tenantId);
    if (!membership) {
      throw new BadRequestException('Not a member of tenant');
    }
    await this.database.withClient(async (client) => {
      await client.query(
        `UPDATE sessions SET active_tenant_id = $1 WHERE id = $2`,
        [tenantId, sessionId],
      );
    });
  }

  async listMyTenants(userId: string) {
    return this.database.withClient(async (client) => {
      const result = await client.query<{
        tenant_id: string;
        name: string;
        slug: string;
      }>(`SELECT * FROM app_list_my_tenants($1)`, [userId]);
      return result.rows;
    });
  }
}
