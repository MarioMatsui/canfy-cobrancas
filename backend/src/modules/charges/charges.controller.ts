import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChargesService } from './charges.service';
import { CreateChargeDto, ListChargesDto } from './charges.dto';

@ApiTags('Cobranças')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('charges')
export class ChargesController {
  constructor(private readonly chargesService: ChargesService) {}

  @Post()
  @ApiOperation({ summary: 'Criar pedido e link CanFy sem criar pagamento no Asaas' })
  create(@Body() dto: CreateChargeDto, @Request() req: { user: { id: string } }) {
    return this.chargesService.create(dto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar cobranças/pedidos' })
  findAll(@Query() query: ListChargesDto) {
    return this.chargesService.findAll(query);
  }

  @Get('reusable')
  @ApiOperation({ summary: 'Listar cobranças reutilizáveis legadas' })
  getReusable() {
    return this.chargesService.getReusableCharges();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar cobrança por ID' })
  findOne(@Param('id') id: string) {
    return this.chargesService.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancelar cobrança/pedido' })
  cancel(@Param('id') id: string) {
    return this.chargesService.cancel(id);
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Ativar/desativar cobrança reutilizável legada' })
  toggleActive(@Param('id') id: string) {
    return this.chargesService.toggleActive(id);
  }
}
