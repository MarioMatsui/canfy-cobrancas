import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthenticatedIntegration } from '../integrations/integrations.service';
@Injectable()
export class DoctorIntegrationOrganizationGuard implements CanActivate {
  canActivate(context:ExecutionContext):boolean {
    const req=context.switchToHttp().getRequest<{integration?:AuthenticatedIntegration}>();
    if (!req.integration?.doctorOrganizationId) {
      throw new ForbiddenException('Integração médica não está vinculada a uma organização autorizada');
    }
    return true;
  }
}
