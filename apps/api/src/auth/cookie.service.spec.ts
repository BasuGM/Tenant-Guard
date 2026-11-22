import { CookieService } from './cookie.service';

describe('CookieService production secure flag', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('requires COOKIE_SECURE=true in production', () => {
    process.env = { ...originalEnv, NODE_ENV: 'production' };
    delete process.env.COOKIE_SECURE;
    const service = new CookieService();
    const res = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };
    expect(() => service.setSession(res as never, 'abc')).toThrow(
      /COOKIE_SECURE=true/,
    );
  });
});
