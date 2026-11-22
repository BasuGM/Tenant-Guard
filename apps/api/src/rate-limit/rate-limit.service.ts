import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retryAfter = window
  if oldest[2] then
    retryAfter = math.ceil((tonumber(oldest[2]) + window - now) / 1000)
    if retryAfter < 1 then retryAfter = 1 end
  end
  return {0, 0, retryAfter}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
local remaining = limit - (count + 1)
return {1, remaining, 0}
`;

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfter: number };

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private redis: Redis | null = null;
  private enabled = false;

  constructor() {
    const url = process.env.REDIS_URL;
    if (url) {
      this.redis = new Redis(url, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        lazyConnect: true,
      });
      this.enabled = true;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }

  async hit(
    key: string,
    limit: number,
    windowMs = 60_000,
  ): Promise<RateLimitResult> {
    if (!this.redis) {
      return { allowed: true, remaining: limit };
    }

    try {
      if (this.redis.status !== 'ready') {
        await this.redis.connect();
      }
      const now = Date.now();
      const member = `${now}-${Math.random()}`;
      const result = (await this.redis.eval(
        SLIDING_WINDOW_LUA,
        1,
        key,
        now,
        windowMs,
        limit,
        member,
      )) as [number, number, number];

      if (result[0] === 1) {
        return { allowed: true, remaining: result[1] };
      }
      return { allowed: false, retryAfter: result[2] };
    } catch {
      // Fail closed when Redis errors.
      throw new Error('RATE_LIMIT_UNAVAILABLE');
    }
  }
}
