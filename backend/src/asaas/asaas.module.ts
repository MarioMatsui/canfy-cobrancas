import { Global, Module } from '@nestjs/common';
import { AsaasService } from './asaas.service';

@Global()
@Module({
  providers: [AsaasService],
  exports: [AsaasService],
})
export class AsaasModule {}
