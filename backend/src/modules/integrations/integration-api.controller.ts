import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { IntegrationApiKeyGuard } from './integration-api-key.guard';
import {
  IntegrationDoctorDto,
  IntegrationDoctorListResponseDto,
  IntegrationListQueryDto,
  IntegrationProductDto,
  IntegrationProductListResponseDto,
  IntegrationSupplierDto,
  IntegrationSupplierListResponseDto,
} from './integration-api.dto';
import { IntegrationReadService } from './integration-read.service';
import { RequireIntegrationScopes } from './integration-scopes.decorator';
import { IntegrationScopesGuard } from './integration-scopes.guard';

@ApiTags('Integration API v1')
@ApiSecurity('canfy-integration-key')
@UseGuards(IntegrationApiKeyGuard, IntegrationScopesGuard)
@Controller('integrations/v1')
export class IntegrationApiController {
  constructor(private readonly readService: IntegrationReadService) {}

  @Get('products')
  @RequireIntegrationScopes('products:read')
  @ApiOperation({
    summary: 'Listar produtos elegíveis para integrações',
    description: 'Requer o scope products:read.',
  })
  @ApiOkResponse({ type: IntegrationProductListResponseDto })
  @ApiBadRequestResponse({ description: 'Parâmetros de consulta inválidos.' })
  @ApiUnauthorizedResponse({ description: 'Credencial de integração inválida.' })
  @ApiForbiddenResponse({ description: 'Permissão de integração insuficiente.' })
  listProducts(@Query() query: IntegrationListQueryDto) {
    return this.readService.listProducts(query);
  }

  @Get('products/:id')
  @RequireIntegrationScopes('products:read')
  @ApiOperation({
    summary: 'Buscar produto elegível por ID',
    description: 'Requer o scope products:read.',
  })
  @ApiOkResponse({ type: IntegrationProductDto })
  @ApiBadRequestResponse({ description: 'ID inválido.' })
  @ApiUnauthorizedResponse({ description: 'Credencial de integração inválida.' })
  @ApiForbiddenResponse({ description: 'Permissão de integração insuficiente.' })
  @ApiNotFoundResponse({ description: 'Produto não encontrado ou indisponível para novas operações.' })
  getProduct(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.readService.getProduct(id);
  }

  @Get('suppliers')
  @RequireIntegrationScopes('subaccounts:read')
  @ApiOperation({
    summary: 'Listar fornecedores elegíveis para integrações',
    description: 'Requer o scope subaccounts:read.',
  })
  @ApiOkResponse({ type: IntegrationSupplierListResponseDto })
  @ApiBadRequestResponse({ description: 'Parâmetros de consulta inválidos.' })
  @ApiUnauthorizedResponse({ description: 'Credencial de integração inválida.' })
  @ApiForbiddenResponse({ description: 'Permissão de integração insuficiente.' })
  listSuppliers(@Query() query: IntegrationListQueryDto) {
    return this.readService.listSuppliers(query);
  }

  @Get('suppliers/:id')
  @RequireIntegrationScopes('subaccounts:read')
  @ApiOperation({
    summary: 'Buscar fornecedor elegível por ID',
    description: 'Requer o scope subaccounts:read.',
  })
  @ApiOkResponse({ type: IntegrationSupplierDto })
  @ApiBadRequestResponse({ description: 'ID inválido.' })
  @ApiUnauthorizedResponse({ description: 'Credencial de integração inválida.' })
  @ApiForbiddenResponse({ description: 'Permissão de integração insuficiente.' })
  @ApiNotFoundResponse({ description: 'Fornecedor não encontrado ou inelegível para novas operações.' })
  getSupplier(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.readService.getSupplier(id);
  }

  @Get('doctors')
  @RequireIntegrationScopes('doctors:read')
  @ApiOperation({
    summary: 'Listar médicos elegíveis para integrações',
    description: 'Requer o scope doctors:read.',
  })
  @ApiOkResponse({ type: IntegrationDoctorListResponseDto })
  @ApiBadRequestResponse({ description: 'Parâmetros de consulta inválidos.' })
  @ApiUnauthorizedResponse({ description: 'Credencial de integração inválida.' })
  @ApiForbiddenResponse({ description: 'Permissão de integração insuficiente.' })
  listDoctors(@Query() query: IntegrationListQueryDto) {
    return this.readService.listDoctors(query);
  }

  @Get('doctors/:id')
  @RequireIntegrationScopes('doctors:read')
  @ApiOperation({
    summary: 'Buscar médico elegível por ID',
    description: 'Requer o scope doctors:read.',
  })
  @ApiOkResponse({ type: IntegrationDoctorDto })
  @ApiBadRequestResponse({ description: 'ID inválido.' })
  @ApiUnauthorizedResponse({ description: 'Credencial de integração inválida.' })
  @ApiForbiddenResponse({ description: 'Permissão de integração insuficiente.' })
  @ApiNotFoundResponse({ description: 'Médico não encontrado ou inelegível para novas operações.' })
  getDoctor(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.readService.getDoctor(id);
  }
}
