import { Module } from '@nestjs/common';
import { SubaccountsService } from './subaccounts.service';
import { SubaccountsController } from './subaccounts.controller';

@Module({
  controllers: [SubaccountsController],
  providers: [SubaccountsService],
  exports: [SubaccountsService],
})
export class SubaccountsModule {}
