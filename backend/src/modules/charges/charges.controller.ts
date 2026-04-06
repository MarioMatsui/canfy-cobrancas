import { Controller, Get, Post, Body, Param, Query, Delete, UseGuards } from '@nestjs/common';
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
  @ApiOperation({ summary: 'Criar cobrança' })
  create(@Body() dto: CreateChargeDto) {
    return this.chargesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar cobranças' })
  findAll(@Query() query: ListChargesDto) {
    return this.chargesService.findAll(query);
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

  @Post(':id/resend')
  @ApiOperation({ summary: 'Reenviar notificação' })
  resend(@Param('id') id: string) {
    return this.chargesService.resend(id);
  }
}
