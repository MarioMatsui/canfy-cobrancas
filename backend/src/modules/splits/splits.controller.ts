import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SplitsService } from './splits.service';
import { CreateSplitRuleDto, ListSplitRulesDto } from './splits.dto';

@ApiTags('Splits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('splits')
export class SplitsController {
  constructor(private splitsService: SplitsService) {}

  @Post('rules')
  @ApiOperation({ summary: 'Criar regra de split' })
  createRule(@Body() dto: CreateSplitRuleDto) {
    return this.splitsService.createRule(dto);
  }

  @Get('rules')
  @ApiOperation({ summary: 'Listar regras de split' })
  findAllRules(@Query() query: ListSplitRulesDto) {
    return this.splitsService.findAllRules(query);
  }

  @Delete('rules/:id')
  @ApiOperation({ summary: 'Desativar regra de split' })
  deleteRule(@Param('id') id: string) {
    return this.splitsService.deleteRule(id);
  }

  @Get('charges/:chargeId')
  @ApiOperation({ summary: 'Ver splits de uma cobrança' })
  getSplitsByCharge(@Param('chargeId') chargeId: string) {
    return this.splitsService.getSplitResultsByCharge(chargeId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Histórico de splits' })
  getHistory(@Query() query: ListSplitRulesDto) {
    return this.splitsService.getSplitHistory(query);
  }
}
