import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { createExportSchema } from '@tenantguard/shared';
import { ExportsService } from './exports.service';
import { RequirePermission } from '../auth/decorators';
import type { AuthedRequest } from '../auth/session.guard';

@Controller('exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Get()
  @RequirePermission('exports:read')
  list(@Req() req: AuthedRequest) {
    return this.exports.list(req.auth!.user.id, req.auth!.tenantId);
  }

  @Get(':id')
  @RequirePermission('exports:read')
  get(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.exports.get(req.auth!.user.id, req.auth!.tenantId, id);
  }

  @Get(':id/download')
  @RequirePermission('exports:read')
  download(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.exports.downloadUrl(
      req.auth!.user.id,
      req.auth!.tenantId,
      id,
    );
  }

  @Post()
  @RequirePermission('exports:create')
  create(
    @Req() req: AuthedRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const input = createExportSchema.parse(body ?? {});
    return this.exports.create(
      req.auth!.user.id,
      req.auth!.tenantId,
      input,
      idempotencyKey,
    );
  }
}
