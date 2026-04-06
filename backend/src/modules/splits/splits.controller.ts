import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SplitsService } from './splits.service';
import { ListSplitsDto } from './splits.dto';

@ApiTags('Splits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('splits')
export class SplitsController {
  constructor(private splitsService: SplitsService) {}

  @Get('charges/:chargeId')
  @ApiOperation({ summary: 'Ver splits de uma cobrança (com cálculo automático da conta principal)' })
  getSplitsByCharge(@Param('chargeId') chargeId: string) {
    return this.splitsService.getSplitsByCharge(chargeId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Histórico de splits realizados' })
  getHistory(@Query() query: ListSplitsDto) {
    return this.splitsService.getSplitHistory(query.subaccountId);
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Receita por subconta (médicos e fornecedores)' })
  getRevenue() {
    return this.splitsService.getRevenueBySubaccount();
  }
}
