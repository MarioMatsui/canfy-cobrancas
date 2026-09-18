import { Module } from '@nestjs/common';
import { PublicCheckoutController } from './public-checkout.controller';
import { PublicCheckoutService } from './public-checkout.service';

// Se o seu PrismaModule NAO for @Global(), descomente as duas linhas:
// import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  // imports: [PrismaModule],
  controllers: [PublicCheckoutController],
  providers: [PublicCheckoutService],
})
export class PublicCheckoutModule {}
