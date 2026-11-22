import { Injectable } from '@nestjs/common';
import type { Response } from 'express';

@Injectable()
export class CookieService {
  private secure(): boolean {
    if (process.env.NODE_ENV === 'production') {
      if (process.env.COOKIE_SECURE !== 'true') {
        throw new Error('COOKIE_SECURE=true is required in production');
      }
      return true;
    }
    return process.env.COOKIE_SECURE === 'true';
  }

  setSession(res: Response, sessionId: string): void {
    res.cookie('tg_session', sessionId, {
      httpOnly: true,
      secure: this.secure(),
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 12,
    });
  }

  setRefresh(res: Response, token: string): void {
    res.cookie('tg_refresh', token, {
      httpOnly: true,
      secure: this.secure(),
      sameSite: 'lax',
      path: '/api/auth/refresh',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });
  }

  clear(res: Response): void {
    res.clearCookie('tg_session', { path: '/' });
    res.clearCookie('tg_refresh', { path: '/api/auth/refresh' });
  }
}
