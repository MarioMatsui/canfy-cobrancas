import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags, ApiParam } from '@nestjs/swagger';
import { PublicCheckoutService } from './public-checkout.service';
import { PublicChargeResponseDto } from './dto/public-charge.response.dto';

// AJUSTE ESTE IMPORT conforme o seu projeto.
// Se voce tem um guard JWT global (APP_GUARD no app.module), precisa do
// decorator que marca a rota como publica. Procure com:
//   Select-String -Path src\**\*.ts -Pattern "IS_PUBLIC|@Public|SetMetadata"
// import { Public } from '../../common/decorators/public.decorator';

@ApiTags('public-checkout')
@Controller('public/payment')
export class PublicCheckoutController {
  constructor(private readonly service: PublicCheckoutService) {}

  /**
   * Dados de uma cobranca para exibicao no pagar.canfy.
   *
   * Rota publica: sem autenticacao, por definicao. A protecao e o token
   * — UUID v4, 122 bits de entropia, separado do id interno da cobranca.
   *
   * Leitura pura: nao cria nada no Asaas, nao altera status, nao grava.
   */
  // @Public()
  @Get(':token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Dados públicos de uma cobrança pelo token' })
  @ApiParam({ name: 'token', description: 'public_token da cobrança (UUID)' })
  @ApiResponse({ status: 200, type: PublicChargeResponseDto })
  @ApiResponse({ status: 404, description: 'Cobrança não encontrada' })
  @ApiResponse({ status: 410, description: 'Cobrança expirada ou indisponível' })
  async findByToken(
    @Param('token', new ParseUUIDPipe({ version: '4' })) token: string,
  ): Promise<PublicChargeResponseDto> {
    return this.service.findByToken(token);
  }
}
