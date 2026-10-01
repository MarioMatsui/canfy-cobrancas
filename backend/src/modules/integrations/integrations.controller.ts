import { Body, Controller, Get, Header, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { CreateIntegrationDto } from './integrations.dto';
import { IntegrationsService } from './integrations.service';

@ApiTags('Integrações')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar integrações/API Keys (admin)' })
  findAll() {
    return this.integrationsService.findAll();
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Criar integração/API Key (admin)' })
  create(
    @Body() dto: CreateIntegrationDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.integrationsService.create(dto, req.user.id);
  }

  @Post(':id/revoke')
  @ApiOperation({ summary: 'Revogar integração/API Key (admin)' })
  revoke(@Param('id') id: string) {
    return this.integrationsService.revoke(id);
  }

  @Post(':id/rotate')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Rotacionar integração/API Key (admin)' })
  rotate(@Param('id') id: string) {
    return this.integrationsService.rotate(id);
  }
}
