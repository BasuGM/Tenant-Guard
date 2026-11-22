import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { DatabaseModule } from './database/database.module';
import { TenantsModule } from './tenants/tenants.module';
import { ProjectsModule } from './projects/projects.module';
import { AuthModule } from './auth/auth.module';
import { MembersModule } from './members/members.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { ExportsModule } from './exports/exports.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { OriginCheckMiddleware } from './security/origin-check.middleware';
import { RateLimitMiddleware } from './rate-limit/rate-limit.middleware';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    AuthModule,
    TenantsModule,
    ProjectsModule,
    MembersModule,
    RateLimitModule,
    ExportsModule,
    ApiKeysModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(OriginCheckMiddleware, RateLimitMiddleware).forRoutes('*');
  }
}
