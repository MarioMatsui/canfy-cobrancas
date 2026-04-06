import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Visão geral do dashboard' })
  getOverview() {
    return this.dashboardService.getOverview();
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Receita por subconta (filtro por tipo: DOCTOR, SUPPLIER)' })
  getRevenue(@Query('type') type?: string) {
    return this.dashboardService.getRevenueBySubaccount(type);
  }

  @Get('activity')
  @ApiOperation({ summary: 'Atividade recente' })
  getRecentActivity() {
    return this.dashboardService.getRecentActivity();
  }
}
