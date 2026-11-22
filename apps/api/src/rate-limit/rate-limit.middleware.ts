import {
  Injectable,
  NestMiddleware,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(private readonly rateLimit: RateLimitService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!this.rateLimit.isEnabled()) {
      next();
      return;
    }

    if (!req.path.startsWith('/auth')) {
      next();
      return;
    }

    try {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const result = await this.rateLimit.hit(`rl:ip:${ip}`, 30);
      if (!result.allowed) {
        res.setHeader('Retry-After', String(result.retryAfter));
        throw new HttpException(
          'Too Many Requests',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      res.setHeader('X-RateLimit-Remaining', String(result.remaining));
      next();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Error && error.message === 'RATE_LIMIT_UNAVAILABLE') {
        throw new ServiceUnavailableException('Rate limiter unavailable');
      }
      throw error;
    }
  }
}
