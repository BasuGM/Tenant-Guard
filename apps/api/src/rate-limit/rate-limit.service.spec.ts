import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  it('allows when redis is disabled', async () => {
    delete process.env.REDIS_URL;
    const service = new RateLimitService();
    await expect(service.hit('k', 10)).resolves.toEqual({
      allowed: true,
      remaining: 10,
    });
  });
});
