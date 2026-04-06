import { Controller, Get, Post, Body, Param, Query, Delete, Patch, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChargesService } from './charges.service';
import { CreateChargeDto, ListChargesDto } from './charges.dto';

@ApiTags('Cobranças')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('charges')
export class ChargesController {
  constructor(private chargesService: ChargesService) {}

  @Post()
  @ApiOperation({ summary: 'Criar cobrança (avulsa ou reutilizável) com splits' })
  create(@Body() dto: CreateChargeDto) {
    return this.chargesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar cobranças' })
  findAll(@Query() query: ListChargesDto) {
    return this.chargesService.findAll(query);
  }

  @Get('reusable')
  @ApiOperation({ summary: 'Listar cobranças reutilizáveis (links permanentes)' })
  getReusable() {
    return this.chargesService.getReusableCharges();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar cobrança por ID' })
  findOne(@Param('id') id: string) {
    return this.chargesService.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancelar cobrança' })
  cancel(@Param('id') id: string) {
    return this.chargesService.cancel(id);
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Ativar/desativar cobrança reutilizável' })
  toggleActive(@Param('id') id: string) {
    return this.chargesService.toggleActive(id);
  }
}
