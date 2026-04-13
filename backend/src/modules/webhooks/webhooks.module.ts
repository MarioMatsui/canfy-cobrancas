import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksProcessor } from './webhooks.processor';
import { AsaasModule } from '../../asaas/asaas.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'webhooks',
    }),
    AsaasModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhooksProcessor],
})
export class WebhooksModule {}
