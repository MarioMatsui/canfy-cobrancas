import { Controller, Get, Post, Put, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ServiceTypesService } from './service-types.service';
import { CreateServiceTypeDto, UpdateServiceTypeDto } from './service-types.dto';

@ApiTags('Tipos de Serviço')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('service-types')
export class ServiceTypesController {
  constructor(private serviceTypesService: ServiceTypesService) {}

  @Post()
  @ApiOperation({ summary: 'Criar tipo de serviço' })
  create(@Body() dto: CreateServiceTypeDto) {
    return this.serviceTypesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar tipos de serviço' })
  findAll() {
    return this.serviceTypesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar tipo de serviço por ID' })
  findOne(@Param('id') id: string) {
    return this.serviceTypesService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar tipo de serviço (nome, descrição, % split)' })
  update(@Param('id') id: string, @Body() dto: UpdateServiceTypeDto) {
    return this.serviceTypesService.update(id, dto);
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Ativar/desativar tipo de serviço' })
  toggleActive(@Param('id') id: string) {
    return this.serviceTypesService.toggleActive(id);
  }
}
