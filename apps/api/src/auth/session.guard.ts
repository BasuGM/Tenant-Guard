import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './decorators';
import { AuthService } from './auth.service';
import type { RequestAuth } from './auth.types';

export type AuthedRequest = Request & { auth?: RequestAuth };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest<AuthedRequest>();

    // Test-only auth harness for isolation HTTP tests (never enabled in production).
    if (
      process.env.ALLOW_TEST_AUTH === 'true' &&
      process.env.NODE_ENV !== 'production'
    ) {
      const testUser = req.header('x-test-user-id');
      const testTenant = req.header('x-test-tenant-id');
      if (testUser) {
        req.auth = await this.auth.buildTestAuth(testUser, testTenant ?? null);
        return true;
      }
    }

    const sessionId = req.cookies?.tg_session as string | undefined;
    if (!sessionId) {
      if (isPublic) return true;
      throw new UnauthorizedException();
    }

    const auth = await this.auth.resolveSession(sessionId);
    if (!auth) {
      if (isPublic) return true;
      throw new UnauthorizedException();
    }

    req.auth = auth;
    return true;
  }
}
