import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from './common/prisma/prisma.module';
import { AsaasModule } from './asaas/asaas.module';
import { AuthModule } from './modules/auth/auth.module';
import { SubaccountsModule } from './modules/subaccounts/subaccounts.module';
import { ChargesModule } from './modules/charges/charges.module';
import { SplitsModule } from './modules/splits/splits.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { SyncModule } from './modules/sync/sync.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ServiceTypesModule } from './modules/service-types/service-types.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    PrismaModule,
    AsaasModule,
    AuthModule,
    SubaccountsModule,
    ChargesModule,
    SplitsModule,
    ServiceTypesModule,
    WebhooksModule,
    SyncModule,
    DashboardModule,
  ],
})
export class AppModule {}
