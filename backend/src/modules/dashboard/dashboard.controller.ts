import { Controller, Get, UseGuards } from '@nestjs/common';
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

  @Get('volume')
  @ApiOperation({ summary: 'Volume por subconta' })
  getVolumeBySubaccount() {
    return this.dashboardService.getVolumeBySubaccount();
  }

  @Get('activity')
  @ApiOperation({ summary: 'Atividade recente' })
  getRecentActivity() {
    return this.dashboardService.getRecentActivity();
  }
}
