import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateProductDto, ListProductsDto, UpdateProductDto } from './products.dto';
import { ProductsService } from './products.service';

type AuthRequest = { user: { id: string; role: 'ADMIN' | 'ATTENDANT' } };

@ApiTags('Produtos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  private assertAdmin(req: AuthRequest) {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('Apenas administradores podem gerenciar o catálogo de produtos');
    }
  }

  @Get()
  @ApiOperation({ summary: 'Listar produtos do catálogo' })
  findAll(@Query() query: ListProductsDto) {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar produto por ID' })
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar produto no catálogo administrativo' })
  create(@Body() dto: CreateProductDto, @Request() req: AuthRequest) {
    this.assertAdmin(req);
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar produto do catálogo' })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto, @Request() req: AuthRequest) {
    this.assertAdmin(req);
    return this.productsService.update(id, dto);
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Ativar/desativar produto' })
  toggle(@Param('id') id: string, @Request() req: AuthRequest) {
    this.assertAdmin(req);
    return this.productsService.toggleActive(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir produto apenas quando não houver histórico de cobranças' })
  remove(@Param('id') id: string, @Request() req: AuthRequest) {
    this.assertAdmin(req);
    return this.productsService.remove(id);
  }
}
