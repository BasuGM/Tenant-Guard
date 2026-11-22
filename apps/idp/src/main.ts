import { Provider } from 'oidc-provider';

const clients = [
  {
    client_id: process.env.OIDC_CLIENT_ID ?? 'tenantguard-web',
    client_secret: process.env.OIDC_CLIENT_SECRET ?? 'tenantguard-dev-secret',
    redirect_uris: [
      process.env.OIDC_REDIRECT_URI ??
        'http://localhost:3100/api/auth/callback',
    ],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post',
  },
];

const configuration = {
  clients,
  pkce: {
    required: () => true,
    methods: ['S256'],
  },
  cookies: {
    keys: ['tenantguard-idp-dev-key'],
  },
  features: {
    devInteractions: { enabled: true },
  },
  claims: {
    openid: ['sub'],
    email: ['email'],
    profile: ['name'],
  },
  findAccount: async (_ctx: unknown, id: string) => ({
    accountId: id,
    async claims() {
      return {
        sub: id,
        email: `${id}@example.test`,
        name: id === 'alice' ? 'Alice' : id === 'bob' ? 'Bob' : id,
      };
    },
  }),
};

const port = Number(process.env.IDP_PORT ?? 3002);
const issuer = process.env.OIDC_ISSUER ?? `http://localhost:${port}`;

const provider = new Provider(issuer, configuration);
provider.proxy = true;

provider.listen(port, () => {
  console.log(`TenantGuard local IdP listening on ${port} (${issuer})`);
});
