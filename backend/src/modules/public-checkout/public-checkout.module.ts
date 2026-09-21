import { Module } from '@nestjs/common';
import { PublicCheckoutController } from './public-checkout.controller';
import { PublicCheckoutService } from './public-checkout.service';

@Module({
  controllers: [PublicCheckoutController],
  providers: [PublicCheckoutService],
})
export class PublicCheckoutModule {}
