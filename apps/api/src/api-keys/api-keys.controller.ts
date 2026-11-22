import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { ApiKeysService } from './api-keys.service';
import { RequirePermission } from '../auth/decorators';
import type { AuthedRequest } from '../auth/session.guard';

const createKeySchema = z.object({
  name: z.string().min(1).max(80),
});

@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @RequirePermission('roles:manage')
  list(@Req() req: AuthedRequest) {
    return this.apiKeys.list(req.auth!.user.id, req.auth!.tenantId);
  }

  @Post()
  @RequirePermission('roles:manage')
  create(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = createKeySchema.parse(body);
    return this.apiKeys.create(
      req.auth!.user.id,
      req.auth!.tenantId,
      input.name,
    );
  }

  @Post(':id/revoke')
  @RequirePermission('roles:manage')
  revoke(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.apiKeys.revoke(req.auth!.user.id, req.auth!.tenantId, id);
  }
}
