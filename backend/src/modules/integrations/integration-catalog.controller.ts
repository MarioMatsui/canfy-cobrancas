import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ProductsService } from '../products/products.service';
import { ListProductsDto } from '../products/products.dto';
import { IntegrationApiKeyGuard } from './integration-api-key.guard';
import { IntegrationScopesGuard } from './integration-scopes.guard';
import { RequireIntegrationScopes } from './integration-scopes.decorator';

class CatalogQueryDto extends ListProductsDto {}

@ApiTags('Integration catalog')
@ApiSecurity('canfy-integration-key')
@Controller('integrations/v1/catalog')
@UseGuards(IntegrationApiKeyGuard, IntegrationScopesGuard)
@RequireIntegrationScopes('catalog:read')
export class IntegrationCatalogController {
  constructor(private readonly products: ProductsService) {}

  @Get('products')
  @ApiOperation({ summary: 'Catálogo administrativo paginado, incluindo inativos e pendentes' })
  async list(@Query() query: CatalogQueryDto) {
    const [result, summary, facets] = await Promise.all([
      this.products.findAll(query),
      this.products.catalogSummary(query.eligible === true),
      this.products.catalogFacets(query.eligible === true),
    ]);
    return {
      data: result.data.map(product => ({
        id: product.id, name: product.name, sku: product.sku,
        description: product.description, brand: product.brand, phytocannabinoids: product.phytocannabinoids,
        imageUrl: product.imageUrl, coaUrl: product.coaUrl, coaBatch: product.coaBatch,
        coaAnalyzedAt: product.coaAnalyzedAt, coaValidUntil: product.coaValidUntil,
        createdAt: product.createdAt, updatedAt: product.updatedAt,
        defaultPrice: product.defaultPrice.toString(), priceCurrency: product.priceCurrency,
        productType: product.productType, active: product.active,
        eligible: product.active && product.eligible, eligibilityIssues: product.eligibilityIssues,
        priceBrl: product.priceBrl, marketRate: product.marketRate, exchangeRateMarkup: product.exchangeRateMarkup,
        appliedRate: product.appliedRate, exchangeRate: product.exchangeRate,
        exchangeRateQuotedAt: product.exchangeRateQuotedAt,
        supplier: product.supplier ? {
          id: product.supplier.id, name: product.supplier.name,
          fulfillmentType: product.supplier.fulfillmentType,
        } : null,
      })),
      pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
      summary,
      facets,
    };
  }

  @Get('products/:id')
  async detail(@Param('id', new ParseUUIDPipe({version:'4'})) id: string) {
    const product = await this.products.findOne(id);
    return {
      id:product.id, name:product.name,sku:product.sku,description:product.description,brand:product.brand,phytocannabinoids:product.phytocannabinoids,
      imageUrl:product.imageUrl,coaUrl:product.coaUrl,coaBatch:product.coaBatch,
      coaAnalyzedAt:product.coaAnalyzedAt,coaValidUntil:product.coaValidUntil,
      createdAt:product.createdAt,updatedAt:product.updatedAt,
      defaultPrice:product.defaultPrice.toString(),priceCurrency:product.priceCurrency,productType:product.productType,
      active:product.active,eligible:product.active && product.eligible,eligibilityIssues:product.eligibilityIssues,
      priceBrl:product.priceBrl,marketRate:product.marketRate,exchangeRateMarkup:product.exchangeRateMarkup,
      appliedRate:product.appliedRate,exchangeRate:product.exchangeRate,
      exchangeRateQuotedAt:product.exchangeRateQuotedAt,
      supplier:product.supplier ? {id:product.supplier.id,name:product.supplier.name,fulfillmentType:product.supplier.fulfillmentType}:null,
    };
  }
}
