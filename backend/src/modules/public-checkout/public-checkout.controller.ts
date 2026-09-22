import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  PublicChargeResponseDto,
  PublicPaymentStartResponseDto,
} from './dto/public-charge.response.dto';
import { StartPublicPaymentDto } from './dto/start-public-payment.dto';
import { PublicCheckoutService } from './public-checkout.service';

@ApiTags('public-checkout')
@Controller('public/payment')
export class PublicCheckoutController {
  constructor(private readonly service: PublicCheckoutService) {}

  /**
   * Leitura publica do pagar.canfy. Este GET nunca cria Payment, nunca altera
   * orderStatus e nunca cria/cancela cobranca no Asaas.
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

  /**
   * A unica rota publica com efeito de pagamento. O navegador informa somente
   * a intencao PIX/CARD; valor, cliente e splits sempre vêm do banco.
   */
  @Post(':token/start')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @Header('Pragma', 'no-cache')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @ApiOperation({ summary: 'Inicia ou retoma uma tentativa de pagamento' })
  @ApiParam({ name: 'token', description: 'public_token opaco da cobrança (UUID v4)' })
  @ApiResponse({ status: 200, type: PublicPaymentStartResponseDto })
  @ApiResponse({ status: 404, description: 'Cobrança não encontrada' })
  @ApiResponse({ status: 410, description: 'Cobrança expirada ou indisponível' })
  @ApiResponse({ status: 503, description: 'Pagamento temporariamente indisponível' })
  async startPayment(
    @Param('token') token: string,
    @Body() dto: StartPublicPaymentDto,
  ): Promise<PublicPaymentStartResponseDto> {
    return this.service.startPayment(token, dto);
  }
}
