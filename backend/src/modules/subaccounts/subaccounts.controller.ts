import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SubaccountsService } from './subaccounts.service';
import { CreateSubaccountDto, UpdateSubaccountDto, ListSubaccountsDto, LinkExistingSubaccountDto } from './subaccounts.dto';

@ApiTags('Subcontas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('subaccounts')
export class SubaccountsController {
  constructor(private subaccountsService: SubaccountsService) {}

  @Post()
  @ApiOperation({ summary: 'Criar subconta (médico, fornecedor, etc.)' })
  create(@Body() dto: CreateSubaccountDto) {
    return this.subaccountsService.create(dto);
  }

  @Post('link')
  @ApiOperation({ summary: 'Vincular conta Asaas existente via Wallet ID' })
  linkExisting(@Body() dto: LinkExistingSubaccountDto) {
    return this.subaccountsService.linkExisting(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar subcontas (filtro por tipo, status, busca)' })
  findAll(@Query() query: ListSubaccountsDto) {
    return this.subaccountsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar subconta por ID' })
  findOne(@Param('id') id: string) {
    return this.subaccountsService.findOne(id);
  }

  @Get(':id/financial-history')
  @ApiOperation({ summary: 'Histórico financeiro da subconta (splits recebidos)' })
  getFinancialHistory(@Param('id') id: string) {
    return this.subaccountsService.getFinancialHistory(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar subconta' })
  update(@Param('id') id: string, @Body() dto: UpdateSubaccountDto) {
    return this.subaccountsService.update(id, dto);
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Ativar/desativar subconta' })
  toggleActive(@Param('id') id: string) {
    return this.subaccountsService.toggleActive(id);
  }

  @Post(':id/resend-activation')
  @ApiOperation({ summary: 'Reenviar link de ativação da subconta Asaas (permitido apenas uma vez por subconta)' })
  resendActivation(@Param('id') id: string) {
    return this.subaccountsService.resendActivation(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir subconta' })
  remove(@Param('id') id: string) {
    return this.subaccountsService.remove(id);
  }

  @Post('sync')
  @ApiOperation({ summary: 'Sincronizar subcontas do Asaas' })
  sync() {
    return this.subaccountsService.syncFromAsaas();
  }
}
