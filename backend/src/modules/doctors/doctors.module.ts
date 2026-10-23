import {Module} from '@nestjs/common';
import {IntegrationsModule} from '../integrations/integrations.module';
import {DoctorsController} from './doctors.controller';
import {IntegrationDoctorsAdminController} from './integration-doctors-admin.controller';
import {DoctorIntegrationOrganizationGuard} from './doctor-integration-organization.guard';
import {DoctorsService} from './doctors.service';

@Module({
 imports:[IntegrationsModule],
 controllers:[DoctorsController,IntegrationDoctorsAdminController],
 providers:[DoctorsService,DoctorIntegrationOrganizationGuard],
 exports:[DoctorsService],
})
export class DoctorsModule {}
