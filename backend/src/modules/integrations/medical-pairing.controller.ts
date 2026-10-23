import {Body,Controller,Get,Header,Param,ParseUUIDPipe,Post,Request,UseGuards} from '@nestjs/common';
import {ApiBearerAuth,ApiSecurity,ApiTags} from '@nestjs/swagger';
import {IsUUID,Matches} from 'class-validator';
import {JwtAuthGuard} from '../auth/jwt-auth.guard';
import {Roles,RolesGuard} from '../auth/roles.guard';
import {IntegrationApiKeyGuard} from './integration-api-key.guard';
import {AuthenticatedIntegration} from './integrations.service';
import {MedicalPairingService} from './medical-pairing.service';

class ClaimOrganizationDto {
  @IsUUID() organizationId!:string;
  @Matches(/^[A-Fa-f0-9]{32}$/) pairingCode!:string;
}
@ApiTags('Pareamento médico - autorização Canfy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard,RolesGuard)
@Roles('ADMIN')
@Controller('integrations')
export class MedicalPairingAdminController {
 constructor(private readonly pairing:MedicalPairingService){}
 @Post(':id/doctor-pairing') @Header('Cache-Control','no-store')
 start(@Param('id',ParseUUIDPipe) id:string,@Request() req:{user:{id:string}}){
  return this.pairing.start(id,req.user.id);
 }
}
@ApiTags('Pareamento médico - integração MsgDesk')
@ApiSecurity('canfy-integration-key')
@UseGuards(IntegrationApiKeyGuard)
@Controller('integrations/v2/doctor-organization')
export class MedicalPairingClaimController {
 constructor(private readonly pairing:MedicalPairingService){}
 @Get('status') @Header('Cache-Control','no-store')
 status(@Request() req:{integration:AuthenticatedIntegration}) {return this.pairing.status(req.integration);}
 @Post('claim') @Header('Cache-Control','no-store')
 claim(@Body() dto:ClaimOrganizationDto,@Request() req:{integration:AuthenticatedIntegration}){
  return this.pairing.claim(req.integration.id,dto.organizationId,dto.pairingCode);
 }
}
