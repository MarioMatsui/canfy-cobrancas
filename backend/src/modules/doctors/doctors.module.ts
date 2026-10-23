import {Module} from '@nestjs/common';
import {IntegrationsModule} from '../integrations/integrations.module';
import {DoctorsController} from './doctors.controller';
import {IntegrationDoctorsAdminController} from './integration-doctors-admin.controller';
import {DoctorIntegrationOrganizationGuard} from './doctor-integration-organization.guard';
import {DoctorsService} from './doctors.service';
import {DoctorOnboardingService} from './doctor-onboarding.service';
import {SubaccountsModule} from '../subaccounts/subaccounts.module';

@Module({
 imports:[IntegrationsModule,SubaccountsModule],
 controllers:[DoctorsController,IntegrationDoctorsAdminController],
 providers:[DoctorsService,DoctorOnboardingService,DoctorIntegrationOrganizationGuard],
 exports:[DoctorsService],
})
export class DoctorsModule {}
