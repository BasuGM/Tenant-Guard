import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { createTenantSchema } from '@tenantguard/shared';
import { TenantsService } from './tenants.service';
import type { AuthedRequest } from '../auth/session.guard';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.tenants.listForUser(req.auth!.user.id);
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = createTenantSchema.parse(body);
    return this.tenants.create(req.auth!.user.id, input);
  }
}
