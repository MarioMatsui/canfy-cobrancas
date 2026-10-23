import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { SubaccountsService } from './subaccounts.service';
import {
  CreateSubaccountDto,
  UpdateSubaccountDto,
  UpdateSubaccountMetadataDto,
  ListSubaccountsDto,
  LinkExistingSubaccountDto,
} from './subaccounts.dto';

@ApiTags('Subcontas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('subaccounts')
export class SubaccountsController {
  constructor(private subaccountsService: SubaccountsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Criar subconta (médico, fornecedor, etc.)' })
  create(@Body() dto: CreateSubaccountDto) {
    return this.subaccountsService.create(dto);
  }

  @Post('link')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
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
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Atualizar dados cadastrais da subconta (sincroniza com Asaas)' })
  update(@Param('id') id: string, @Body() dto: UpdateSubaccountDto) {
    return this.subaccountsService.update(id, dto);
  }

  @Patch(':id/metadata')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Atualizar metadados internos Canfy sem alterar a conta no Asaas' })
  updateMetadata(@Param('id') id: string, @Body() dto: UpdateSubaccountMetadataDto) {
    return this.subaccountsService.updateMetadata(id, dto);
  }

  @Patch(':id/toggle')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Ativar/desativar subconta' })
  toggleActive(@Param('id') id: string) {
    return this.subaccountsService.toggleActive(id);
  }

  @Post(':id/resend-activation')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Reenviar link de ativação da subconta Asaas (permitido apenas uma vez por subconta)' })
  resendActivation(@Param('id') id: string) {
    return this.subaccountsService.resendActivation(id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Excluir subconta' })
  remove(@Param('id') id: string) {
    return this.subaccountsService.remove(id);
  }

  @Post('sync')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Sincronizar subcontas do Asaas' })
  sync() {
    return this.subaccountsService.syncFromAsaas();
  }
}
