import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { sha256 } from '../crypto/hash';

describe('AuthService refresh rotation', () => {
  it('rotates and detects reuse', async () => {
    const tokens = new Map<
      string,
      {
        id: string;
        family_id: string;
        user_id: string;
        session_id: string;
        revoked_at: Date | null;
        expires_at: Date;
      }
    >();

    let currentPlain = 'RT-001';
    const familyId = 'family-1';
    const sessionId = 'session-1';
    tokens.set(sha256(currentPlain), {
      id: 't1',
      family_id: familyId,
      user_id: 'u1',
      session_id: sessionId,
      revoked_at: null,
      expires_at: new Date(Date.now() + 60_000),
    });

    const client = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('BEGIN') || sql.includes('COMMIT') || sql.includes('ROLLBACK')) {
          return { rows: [] };
        }
        if (sql.includes('FROM refresh_tokens') && sql.includes('token_hash')) {
          const hash = params?.[0] as string;
          const row = tokens.get(hash);
          return { rows: row ? [row] : [] };
        }
        if (sql.includes('UPDATE refresh_tokens') && sql.includes('WHERE id')) {
          const id = params?.[0] as string;
          for (const [hash, row] of tokens) {
            if (row.id === id) {
              tokens.set(hash, { ...row, revoked_at: new Date() });
            }
          }
          return { rows: [] };
        }
        if (sql.includes('UPDATE refresh_tokens') && sql.includes('family_id')) {
          for (const [hash, row] of tokens) {
            if (row.family_id === params?.[0]) {
              tokens.set(hash, { ...row, revoked_at: new Date() });
            }
          }
          return { rows: [] };
        }
        if (sql.includes('UPDATE sessions')) {
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO refresh_tokens')) {
          const hash = params?.[3] as string;
          tokens.set(hash, {
            id: 't2',
            family_id: params?.[0] as string,
            user_id: params?.[1] as string,
            session_id: params?.[2] as string,
            revoked_at: null,
            expires_at: params?.[5] as Date,
          });
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };

    const database = {
      withClient: async (fn: (c: typeof client) => Promise<unknown>) => fn(client),
    };

    const service = new AuthService(database as never);

    const rotated = await service.rotateRefreshToken(currentPlain);
    expect(rotated.sessionId).toBe(sessionId);
    expect(rotated.refreshToken).not.toBe(currentPlain);

    await expect(service.rotateRefreshToken(currentPlain)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
