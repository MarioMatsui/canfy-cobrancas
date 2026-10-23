import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { IntegrationApiKeyGuard } from '../integrations/integration-api-key.guard';
import { IntegrationScopesGuard } from '../integrations/integration-scopes.guard';
import { RequireIntegrationScopes } from '../integrations/integration-scopes.decorator';
import { DoctorsService } from './doctors.service';
import { CreateDoctorDto, DoctorFinancialLinkDto, DoctorLicenseInputDto, DoctorListDto, UpdateDoctorDto } from './doctors.dto';

@ApiTags('Integração médica administrativa — v2')
@ApiSecurity('canfy-integration-key')
@UseGuards(IntegrationApiKeyGuard,IntegrationScopesGuard)
@Controller('integrations/v2/admin/doctors')
export class IntegrationDoctorsAdminController {
  constructor(private readonly doctors:DoctorsService){}
  @Get() @RequireIntegrationScopes('doctors:admin:read')
  list(@Query() q:DoctorListDto){return this.doctors.list(q);}
  @Get('legacy-candidates') @RequireIntegrationScopes('doctors:admin:read')
  legacy(@Query() q:DoctorListDto){return this.doctors.legacyCandidates(q);}
  @Get(':id') @RequireIntegrationScopes('doctors:admin:read')
  detail(@Param('id',ParseUUIDPipe) id:string){return this.doctors.detail(id);}
  @Post() @RequireIntegrationScopes('doctors:admin:write')
  create(@Body() dto:CreateDoctorDto,@Headers('idempotency-key') key?:string){return this.doctors.create(dto,key);}
  @Patch(':id') @RequireIntegrationScopes('doctors:admin:write')
  update(@Param('id',ParseUUIDPipe) id:string,@Body() dto:UpdateDoctorDto){return this.doctors.update(id,dto);}
  @Post(':id/licenses') @RequireIntegrationScopes('doctors:admin:write')
  license(@Param('id',ParseUUIDPipe) id:string,@Body() dto:DoctorLicenseInputDto){return this.doctors.addLicense(id,dto);}
  @Post(':id/regularize') @RequireIntegrationScopes('doctors:admin:write')
  regularize(@Param('id',ParseUUIDPipe) id:string){return this.doctors.regularize(id);}
  @Post(':id/financial-links') @RequireIntegrationScopes('doctors:admin:write')
  link(@Param('id',ParseUUIDPipe) id:string,@Body() dto:DoctorFinancialLinkDto){return this.doctors.linkExisting(id,dto);}
  @Get(':id/provisioning') @RequireIntegrationScopes('doctors:admin:read')
  provisioning(@Param('id',ParseUUIDPipe) id:string){return this.doctors.provisioning(id);}
  @Post(':id/provisioning/prepare') @RequireIntegrationScopes('doctors:admin:write')
  prepare(@Param('id',ParseUUIDPipe) id:string){return this.doctors.prepareProvisioning(id);}
}
