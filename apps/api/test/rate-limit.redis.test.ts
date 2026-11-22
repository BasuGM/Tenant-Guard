import Redis from 'ioredis';
import { RateLimitService } from '../src/rate-limit/rate-limit.service';

const hasRedis = process.env.RUN_REDIS_TESTS === 'true';

(hasRedis ? describe : describe.skip)('Redis sliding-window rate limit', () => {
  let redis: Redis;
  const services: RateLimitService[] = [];

  beforeAll(async () => {
    process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
    await redis.flushdb();
  });

  afterAll(async () => {
    for (const service of services) {
      await service.disconnect();
    }
    await redis.quit();
  });

  it('rejects when limit exceeded and returns retryAfter', async () => {
    const service = new RateLimitService();
    services.push(service);
    const key = `test:rl:${Date.now()}`;
    for (let i = 0; i < 5; i += 1) {
      const result = await service.hit(key, 5, 60_000);
      expect(result.allowed).toBe(true);
    }
    const blocked = await service.hit(key, 5, 60_000);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfter).toBeGreaterThan(0);
    }
  });

  it('fails closed when redis is unavailable', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:1';
    const service = new RateLimitService();
    services.push(service);
    await expect(service.hit('x', 1)).rejects.toThrow('RATE_LIMIT_UNAVAILABLE');
    await service.disconnect();
  });
});
