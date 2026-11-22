import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { Issuer, generators, type Client } from 'openid-client';
import { DatabaseService } from '../database/database.service';
import { randomToken } from '../crypto/hash';

@Injectable()
export class OidcService implements OnModuleInit {
  private client: Client | null = null;
  private enabled = false;

  constructor(private readonly database: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    const issuerUrl = process.env.OIDC_ISSUER;
    if (!issuerUrl) {
      this.enabled = false;
      return;
    }

    try {
      const issuer = await Issuer.discover(issuerUrl);
      this.client = new issuer.Client({
        client_id: process.env.OIDC_CLIENT_ID ?? 'tenantguard-web',
        client_secret: process.env.OIDC_CLIENT_SECRET,
        redirect_uris: [
          process.env.OIDC_REDIRECT_URI ??
            'http://localhost:3100/api/auth/callback',
        ],
        response_types: ['code'],
      });
      this.enabled = true;
    } catch {
      // Local boot without IdP is allowed until M3.
      this.enabled = false;
      this.client = null;
    }
  }

  isEnabled(): boolean {
    return this.enabled && !!this.client;
  }

  async startLogin(): Promise<{ authorizationUrl: string }> {
    if (!this.client) {
      throw new UnauthorizedException('OIDC is not configured');
    }

    const state = generators.state();
    const nonce = generators.nonce();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const redirectUri =
      process.env.OIDC_REDIRECT_URI ??
      'http://localhost:3100/api/auth/callback';

    await this.database.withClient(async (client) => {
      await client.query(
        `
        INSERT INTO oidc_transactions
          (state, nonce, code_verifier, redirect_uri, expires_at)
        VALUES ($1, $2, $3, $4, now() + interval '10 minutes')
        `,
        [state, nonce, codeVerifier, redirectUri],
      );
    });

    const authorizationUrl = this.client.authorizationUrl({
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      redirect_uri: redirectUri,
    });

    return { authorizationUrl };
  }

  async handleCallback(query: Record<string, string | string[] | undefined>) {
    if (!this.client) {
      throw new UnauthorizedException('OIDC is not configured');
    }

    const flattened: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === 'string') flattened[key] = value;
      else if (Array.isArray(value) && typeof value[0] === 'string') {
        flattened[key] = value[0];
      }
    }

    const params = this.client.callbackParams(
      `?${new URLSearchParams(flattened).toString()}`,
    );
    const state = params.state;
    if (!state) {
      throw new UnauthorizedException('Missing state');
    }

    const tx = await this.database.withClient(async (client) => {
      const result = await client.query<{
        nonce: string;
        code_verifier: string;
        redirect_uri: string;
        expires_at: Date;
      }>(
        `
        DELETE FROM oidc_transactions
        WHERE state = $1
        RETURNING nonce, code_verifier, redirect_uri, expires_at
        `,
        [state],
      );
      return result.rows[0] ?? null;
    });

    if (!tx || tx.expires_at <= new Date()) {
      throw new UnauthorizedException('Invalid OIDC transaction');
    }

    const tokenSet = await this.client.callback(tx.redirect_uri, params, {
      state,
      nonce: tx.nonce,
      code_verifier: tx.code_verifier,
    });

    const claims = tokenSet.claims();
    if (!claims.sub) {
      throw new UnauthorizedException('Missing subject');
    }

    return {
      issuer: claims.iss,
      subject: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : null,
      displayName:
        typeof claims.name === 'string'
          ? claims.name
          : typeof claims.preferred_username === 'string'
            ? claims.preferred_username
            : null,
    };
  }

  // Used by unit tests when a full IdP is unavailable.
  createPkcePair() {
    const codeVerifier = generators.codeVerifier();
    return {
      state: randomToken(16),
      nonce: generators.nonce(),
      codeVerifier,
      codeChallenge: generators.codeChallenge(codeVerifier),
    };
  }
}
