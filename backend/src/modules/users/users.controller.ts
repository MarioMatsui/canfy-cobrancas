import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateProfileDto } from './users.dto';

@ApiTags('Usuários')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Listar todos os usuários (admin)' })
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Criar novo usuário (admin)' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Excluir usuário (admin)' })
  remove(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.usersService.remove(id, req.user.id);
  }

  @Get('me')
  @ApiOperation({ summary: 'Dados do usuário logado' })
  getMe(@Request() req: { user: { id: string } }) {
    return this.usersService.findOne(req.user.id);
  }

  @Put('me')
  @ApiOperation({ summary: 'Atualizar perfil (nome, email, senha)' })
  updateMe(@Request() req: { user: { id: string; role: string } }, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.id, req.user.role, dto);
  }
}
