import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { InviteMemberInput } from '@tenantguard/shared';
import { DatabaseService } from '../database/database.service';
import { randomToken, sha256 } from '../crypto/hash';

@Injectable()
export class MembersService {
  constructor(private readonly database: DatabaseService) {}

  async list(userId: string, tenantId: string | null) {
    if (!tenantId) throw new NotFoundException();
    return this.database.withTenantTransaction(
      { userId, tenantId },
      async (client) => {
        const result = await client.query(
          `
          SELECT m.id, m.user_id, m.deactivated_at, u.email, u.display_name,
                 array_remove(array_agg(r.system_key), NULL) AS system_roles
          FROM memberships m
          INNER JOIN users u ON u.id = m.user_id
          LEFT JOIN membership_roles mr ON mr.membership_id = m.id
          LEFT JOIN roles r ON r.id = mr.role_id
          GROUP BY m.id, u.email, u.display_name
          ORDER BY m.created_at
          `,
        );
        return result.rows;
      },
    );
  }

  async invite(
    userId: string,
    tenantId: string | null,
    input: InviteMemberInput,
  ) {
    if (!tenantId) throw new NotFoundException();
    const token = randomToken();
    const tokenHash = sha256(token);

    await this.database.withTenantTransaction(
      { userId, tenantId },
      async (client) => {
        await client.query(
          `
          INSERT INTO invitations
            (tenant_id, email, role_system_key, token_hash, invited_by, expires_at)
          VALUES ($1, $2, $3, $4, $5, now() + interval '7 days')
          `,
          [tenantId, input.email.toLowerCase(), input.role, tokenHash, userId],
        );
        await client.query(
          `
          INSERT INTO audit_logs
            (tenant_id, actor_user_id, action, resource_type, metadata)
          VALUES ($1, $2, 'member.invite', 'invitation', $3::jsonb)
          `,
          [
            tenantId,
            userId,
            JSON.stringify({ email: input.email, role: input.role }),
          ],
        );
      },
    );

    return { token };
  }

  async acceptInvitation(userId: string, email: string | null, token: string) {
    if (!email) throw new BadRequestException('Email required');
    const tokenHash = sha256(token);

    return this.database.withClient(async (client) => {
      const result = await client.query<{
        tenant_id: string;
        membership_id: string;
      }>(`SELECT * FROM app_accept_invitation($1, $2, $3)`, [
        userId,
        email,
        tokenHash,
      ]);
      const row = result.rows[0];
      if (!row) throw new NotFoundException('Invitation not found');
      return { tenantId: row.tenant_id, membershipId: row.membership_id };
    });
  }

  async deactivate(
    actorUserId: string,
    tenantId: string | null,
    membershipId: string,
  ) {
    if (!tenantId) throw new NotFoundException();
    return this.database.withTenantTransaction(
      { userId: actorUserId, tenantId },
      async (client) => {
        const result = await client.query(
          `
          UPDATE memberships
          SET deactivated_at = now()
          WHERE id = $1
          RETURNING id
          `,
          [membershipId],
        );
        if (!result.rows[0]) throw new NotFoundException();
        await client.query(
          `
          INSERT INTO audit_logs
            (tenant_id, actor_user_id, action, resource_type, resource_id)
          VALUES ($1, $2, 'member.deactivate', 'membership', $3)
          `,
          [tenantId, actorUserId, membershipId],
        );
        return { ok: true };
      },
    );
  }
}
