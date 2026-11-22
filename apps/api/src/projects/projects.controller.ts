import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  createProjectSchema,
  updateProjectSchema,
} from '@tenantguard/shared';
import { ProjectsService } from './projects.service';
import { RequirePermission } from '../auth/decorators';
import type { AuthedRequest } from '../auth/session.guard';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @RequirePermission('projects:read')
  list(@Req() req: AuthedRequest) {
    return this.projects.list(
      req.auth!.user.id,
      req.auth!.tenantId,
      req.auth!.systemRoles,
    );
  }

  @Get(':id')
  @RequirePermission('projects:read')
  get(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.projects.get(
      req.auth!.user.id,
      req.auth!.tenantId,
      id,
      req.auth!.systemRoles,
    );
  }

  @Post()
  @RequirePermission('projects:create')
  create(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = createProjectSchema.parse(body);
    return this.projects.create(
      req.auth!.user.id,
      req.auth!.tenantId,
      req.auth!.membershipId,
      input,
    );
  }

  @Patch(':id')
  @RequirePermission('projects:update')
  update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = updateProjectSchema.parse(body);
    return this.projects.update(
      req.auth!.user.id,
      req.auth!.tenantId,
      id,
      input,
      req.auth!.systemRoles,
    );
  }

  @Delete(':id')
  @RequirePermission('projects:delete')
  remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.projects.remove(
      req.auth!.user.id,
      req.auth!.tenantId,
      id,
      req.auth!.systemRoles,
    );
  }
}
