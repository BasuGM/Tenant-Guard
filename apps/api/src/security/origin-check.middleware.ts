import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class OriginCheckMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      next();
      return;
    }

    // Auth callback and health are GET; refresh is same-origin cookie POST.
    const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3100';
    const origin = req.header('origin');
    const referer = req.header('referer');

    if (!origin && !referer) {
      // Same-site navigations and non-browser clients may omit Origin.
      // Cookie-authenticated browser POSTs should include Origin/Referer.
      if (req.path.startsWith('/auth/refresh')) {
        next();
        return;
      }
      if (process.env.ALLOW_TEST_AUTH === 'true') {
        next();
        return;
      }
    }

    const allowed = [webOrigin, `http://localhost:${process.env.API_PORT ?? 3001}`];
    if (origin && !allowed.some((a) => origin === a)) {
      throw new ForbiddenException('Invalid origin');
    }
    if (!origin && referer && !allowed.some((a) => referer.startsWith(a))) {
      throw new ForbiddenException('Invalid referer');
    }
    next();
  }
}
