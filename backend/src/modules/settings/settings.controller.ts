import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SettingsService } from './settings.service';
import { UpsertSettingDto } from './settings.dto';

@ApiTags('Configurações')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas as configurações' })
  getAll() {
    return this.settingsService.getAll();
  }

  @Get(':key')
  @ApiOperation({ summary: 'Buscar configuração por chave' })
  get(@Param('key') key: string) {
    return this.settingsService.get(key);
  }

  @Post()
  @ApiOperation({ summary: 'Criar ou atualizar configuração' })
  upsert(@Body() dto: UpsertSettingDto) {
    return this.settingsService.upsert(dto);
  }

  @Delete(':key')
  @ApiOperation({ summary: 'Remover configuração' })
  delete(@Param('key') key: string) {
    return this.settingsService.delete(key);
  }

  @Post('seed')
  @ApiOperation({ summary: 'Criar configurações padrão' })
  seed() {
    return this.settingsService.seedDefaults();
  }
}
