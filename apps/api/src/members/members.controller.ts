import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { inviteMemberSchema } from '@tenantguard/shared';
import { MembersService } from './members.service';
import { RequirePermission } from '../auth/decorators';
import type { AuthedRequest } from '../auth/session.guard';

@Controller()
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('members')
  @RequirePermission('members:read')
  list(@Req() req: AuthedRequest) {
    return this.members.list(req.auth!.user.id, req.auth!.tenantId);
  }

  @Post('members/invite')
  @RequirePermission('members:invite')
  invite(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = inviteMemberSchema.parse(body);
    return this.members.invite(req.auth!.user.id, req.auth!.tenantId, input);
  }

  @Post('members/:id/deactivate')
  @RequirePermission('members:deactivate')
  deactivate(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.members.deactivate(
      req.auth!.user.id,
      req.auth!.tenantId,
      id,
    );
  }

  @Post('invitations/accept')
  accept(@Req() req: AuthedRequest, @Body() body: { token: string }) {
    return this.members.acceptInvitation(
      req.auth!.user.id,
      req.auth!.user.email,
      body.token,
    );
  }
}
