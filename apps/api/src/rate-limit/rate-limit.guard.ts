import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { IS_PUBLIC_KEY } from '../auth/decorators';
import type { AuthedRequest } from '../auth/session.guard';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly rateLimit: RateLimitService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.rateLimit.isEnabled()) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const res = context.switchToHttp().getResponse<Response>();

    if (isPublic && !req.auth) return true;

    try {
      if (req.auth?.user.id) {
        const userResult = await this.rateLimit.hit(
          `rl:user:${req.auth.user.id}`,
          100,
        );
        if (!userResult.allowed) {
          res.setHeader('Retry-After', String(userResult.retryAfter));
          throw new HttpException(
            'Too Many Requests',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        res.setHeader('X-RateLimit-Remaining', String(userResult.remaining));
      }

      if (req.auth?.tenantId) {
        const tenantResult = await this.rateLimit.hit(
          `rl:tenant:${req.auth.tenantId}`,
          1000,
        );
        if (!tenantResult.allowed) {
          res.setHeader('Retry-After', String(tenantResult.retryAfter));
          throw new HttpException(
            'Too Many Requests',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Error && error.message === 'RATE_LIMIT_UNAVAILABLE') {
        throw new ServiceUnavailableException('Rate limiter unavailable');
      }
      throw error;
    }
  }
}
