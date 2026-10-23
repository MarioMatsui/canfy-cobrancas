import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { DoctorsService } from './doctors.service';
import { CreateDoctorDto, DoctorFinancialLinkDto, DoctorLicenseInputDto, DoctorListDto, ReviewDoctorLicenseDto, UpdateDoctorDto } from './doctors.dto';
import { IsUUID,IsString,MinLength,MaxLength } from 'class-validator';
export class AssociateDoctorOrganizationDto { @IsUUID() integrationId!: string; @IsString() @MinLength(8) @MaxLength(250) evidenceReference!:string; }

@ApiTags('Médicos profissionais (admin)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard,RolesGuard)
@Roles('ADMIN')
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctors:DoctorsService) {}
  @Get() list(@Query() q:DoctorListDto){return this.doctors.list(q);}
  @Post() create(@Body() dto:CreateDoctorDto,@Headers('idempotency-key') key?:string){return this.doctors.create(dto,key);}
  @Get('legacy-candidates') legacy(@Query() q:DoctorListDto) {
    return this.doctors.legacyCandidates(q);
  }
  @Get(':id') detail(@Param('id',ParseUUIDPipe) id:string){return this.doctors.detail(id);}
  @Patch(':id') update(@Param('id',ParseUUIDPipe) id:string,@Body() dto:UpdateDoctorDto){return this.doctors.update(id,dto);}
  @Post(':id/licenses') license(@Param('id',ParseUUIDPipe) id:string,@Body() dto:DoctorLicenseInputDto){return this.doctors.addLicense(id,dto);}
  @Post(':id/regularize') regularize(@Param('id',ParseUUIDPipe) id:string){return this.doctors.regularize(id);}
  @Post(':id/financial-links') link(@Param('id',ParseUUIDPipe) id:string,@Body() dto:DoctorFinancialLinkDto){return this.doctors.linkExisting(id,dto);}
  @Post(':id/organization')
  associateOrganization(@Param('id',ParseUUIDPipe) id:string,@Body() dto:AssociateDoctorOrganizationDto,@Request() req:{user:{id:string}}){
    return this.doctors.associateOrganization(id,dto.integrationId,req.user.id,dto.evidenceReference);
  }
  @Post(':id/licenses/review') review(
    @Param('id',ParseUUIDPipe) id:string,
    @Body() dto:ReviewDoctorLicenseDto,
    @Request() req:{user:{id:string}}
  ){return this.doctors.reviewLicense(id,dto,req.user.id);}
  @Get(':id/provisioning') provisioning(@Param('id',ParseUUIDPipe) id:string){return this.doctors.provisioning(id);}
  @Post(':id/provisioning/prepare') prepare(@Param('id',ParseUUIDPipe) id:string){return this.doctors.prepareProvisioning(id);}
}
