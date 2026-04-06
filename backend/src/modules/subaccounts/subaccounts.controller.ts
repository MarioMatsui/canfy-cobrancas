import { Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SubaccountsService } from './subaccounts.service';
import { CreateSubaccountDto, UpdateSubaccountDto, ListSubaccountsDto } from './subaccounts.dto';

@ApiTags('Subcontas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('subaccounts')
export class SubaccountsController {
  constructor(private subaccountsService: SubaccountsService) {}

  @Post()
  @ApiOperation({ summary: 'Criar subconta' })
  create(@Body() dto: CreateSubaccountDto) {
    return this.subaccountsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar subcontas' })
  findAll(@Query() query: ListSubaccountsDto) {
    return this.subaccountsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar subconta por ID' })
  findOne(@Param('id') id: string) {
    return this.subaccountsService.findOne(id);
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

  @Post('sync')
  @ApiOperation({ summary: 'Sincronizar subcontas do Asaas' })
  sync() {
    return this.subaccountsService.syncFromAsaas();
  }
}
