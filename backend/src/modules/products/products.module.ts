import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductMediaController } from './product-media.controller';
import { ProductsService } from './products.service';
import { ExchangeRateModule } from '../../common/exchange-rate/exchange-rate.module';

@Module({
  imports: [ExchangeRateModule],
  controllers: [ProductsController, ProductMediaController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
