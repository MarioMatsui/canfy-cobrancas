import { Body, Controller, Get, Headers, Request, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { IntegrationApiKeyGuard } from '../integrations/integration-api-key.guard';
import { IntegrationScopesGuard } from '../integrations/integration-scopes.guard';
import { RequireIntegrationScopes } from '../integrations/integration-scopes.decorator';
import { DoctorsService } from './doctors.service';
import { DoctorIntegrationOrganizationGuard } from './doctor-integration-organization.guard';
import { CreateDoctorDto, DoctorFinancialLinkDto, DoctorLicenseInputDto, DoctorListDto, UpdateDoctorDto } from './doctors.dto';

@ApiTags('Integração médica administrativa — v2')
@ApiSecurity('canfy-integration-key')
@UseGuards(IntegrationApiKeyGuard,IntegrationScopesGuard,DoctorIntegrationOrganizationGuard)
@Controller('integrations/v2/admin/doctors')
export class IntegrationDoctorsAdminController {
  constructor(private readonly doctors:DoctorsService){}
  @Get() @RequireIntegrationScopes('doctors:admin:read')
  list(@Query() q:DoctorListDto,@Request() req:{integration:{doctorOrganizationId:string}}){return this.doctors.list(q,req.integration.doctorOrganizationId);}
  // Legacy financial candidates are not tenant-tagged. Expose only to Canfy JWT admins.\n  @Get(':id') @RequireIntegrationScopes('doctors:admin:read')
  detail(@Param('id',ParseUUIDPipe) id:string,@Request() req:{integration:{doctorOrganizationId:string}}){return this.doctors.detail(id,req.integration.doctorOrganizationId);}
  @Post() @RequireIntegrationScopes('doctors:admin:write')
  create(@Body() dto:CreateDoctorDto,@Headers('idempotency-key') key:string,@Request() req:{integration:{doctorOrganizationId:string}}){return this.doctors.create(dto,key,req.integration.doctorOrganizationId);}
  @Patch(':id') @RequireIntegrationScopes('doctors:admin:write')
  update(@Param('id',ParseUUIDPipe) id:string,@Body() dto:UpdateDoctorDto,@Request() req:{integration:{doctorOrganizationId:string}}){return this.doctors.update(id,dto,req.integration.doctorOrganizationId);}
  @Post(':id/licenses') @RequireIntegrationScopes('doctors:admin:write')
  license(@Param('id',ParseUUIDPipe) id:string,@Body() dto:DoctorLicenseInputDto,@Request() req:{integration:{doctorOrganizationId:string}}){return this.doctors.addLicense(id,dto,req.integration.doctorOrganizationId);}
  @Post(':id/regularize') @RequireIntegrationScopes('doctors:admin:write')
  regularize(@Param('id',ParseUUIDPipe) id:string,@Request() req:{integration:{doctorOrganizationId:string}}){return this.doctors.regularize(id,req.integration.doctorOrganizationId);}
  // Financial links require Canfy operator review until subaccount ownership is modeled.\n  @Get(':id/provisioning') @RequireIntegrationScopes('doctors:admin:read')
  provisioning(@Param('id',ParseUUIDPipe) id:string,@Request() req:{integration:{doctorOrganizationId:string}}){return this.doctors.provisioning(id,req.integration.doctorOrganizationId);}
  @Post(':id/provisioning/prepare') @RequireIntegrationScopes('doctors:admin:write')
  prepare(@Param('id',ParseUUIDPipe) id:string,@Request() req:{integration:{doctorOrganizationId:string}}){return this.doctors.prepareProvisioning(id,req.integration.doctorOrganizationId);}
}
