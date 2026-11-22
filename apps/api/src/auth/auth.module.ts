import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';
import { PermissionGuard } from './permission.guard';
import { CookieService } from './cookie.service';
import { OidcService } from './oidc.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    CookieService,
    OidcService,
    SessionGuard,
    PermissionGuard,
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [AuthService, CookieService, OidcService],
})
export class AuthModule {}
