import { Controller, Get, Header, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PublicChargeResponseDto } from './dto/public-charge.response.dto';
import { PublicCheckoutService } from './public-checkout.service';

@ApiTags('public-checkout')
@Controller('public/payment')
export class PublicCheckoutController {
  constructor(private readonly service: PublicCheckoutService) {}

  /**
   * Contrato de leitura do pagar.canfy.
   *
   * Esta rota e intencionalmente publica e nao recebe JwtAuthGuard. A protecao
   * e o publicToken opaco da cobranca. O GET nao cria pagamento, nao muda
   * orderStatus e nao grava nada no Asaas ou no banco.
   */
  @Get(':token')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @Header('Pragma', 'no-cache')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Dados públicos de uma cobrança pelo publicToken' })
  @ApiParam({ name: 'token', description: 'public_token opaco da cobrança (UUID v4)' })
  @ApiResponse({ status: 200, type: PublicChargeResponseDto })
  @ApiResponse({ status: 404, description: 'Cobrança não encontrada' })
  @ApiResponse({ status: 410, description: 'Cobrança expirada ou indisponível' })
  async findByToken(@Param('token') token: string): Promise<PublicChargeResponseDto> {
    return this.service.findByToken(token);
  }
}
