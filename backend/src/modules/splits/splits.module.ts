import { Module } from '@nestjs/common';
import { SplitsService } from './splits.service';
import { SplitsController } from './splits.controller';

@Module({
  controllers: [SplitsController],
  providers: [SplitsService],
  exports: [SplitsService],
})
export class SplitsModule {}
