declare module 'oidc-provider' {
  export class Provider {
    constructor(issuer: string, configuration?: Record<string, unknown>);
    proxy: boolean;
    listen(port: number, cb?: () => void): void;
  }
}
