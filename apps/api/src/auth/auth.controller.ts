import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  Body,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from './decorators';
import { AuthService } from './auth.service';
import { CookieService } from './cookie.service';
import { OidcService } from './oidc.service';
import type { AuthedRequest } from './session.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: CookieService,
    private readonly oidc: OidcService,
  ) {}

  @Public()
  @Get('login')
  async login(@Res() res: Response) {
    const { authorizationUrl } = await this.oidc.startLogin();
    return res.redirect(authorizationUrl);
  }

  @Public()
  @Get('callback')
  async callback(
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    const identity = await this.oidc.handleCallback(query);
    const user = await this.auth.upsertUser(identity);
    const tenants = await this.auth.listMyTenants(user.id);
    const activeTenantId = tenants[0]?.tenant_id ?? null;
    const session = await this.auth.createSession(user.id, activeTenantId);
    this.cookies.setSession(res, session.sessionId);
    this.cookies.setRefresh(res, session.refreshToken);
    const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3100';
    return res.redirect(`${webOrigin}/dashboard`);
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const presented = req.cookies?.tg_refresh as string | undefined;
    if (!presented) {
      throw new UnauthorizedException();
    }
    const rotated = await this.auth.rotateRefreshToken(presented);
    this.cookies.setSession(res, rotated.sessionId);
    this.cookies.setRefresh(res, rotated.refreshToken);
    return { ok: true };
  }

  @Post('logout')
  async logout(
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (req.auth?.sessionId) {
      await this.auth.logout(req.auth.sessionId);
    }
    this.cookies.clear(res);
    return { ok: true };
  }

  @Get('me')
  me(@Req() req: AuthedRequest) {
    return {
      user: req.auth?.user ?? null,
      tenantId: req.auth?.tenantId ?? null,
      permissions: req.auth?.permissions ?? [],
      systemRoles: req.auth?.systemRoles ?? [],
    };
  }

  @Post('switch-tenant')
  async switchTenant(
    @Req() req: AuthedRequest,
    @Body() body: { tenantId: string },
  ) {
    if (!req.auth) throw new UnauthorizedException();
    await this.auth.switchTenant(
      req.auth.sessionId,
      req.auth.user.id,
      body.tenantId,
    );
    return { ok: true, tenantId: body.tenantId };
  }
}
