import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Response } from 'express';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get('live')
  live() {
    return {
      status: 'ok',
      service: 'rumindium-invoice-api',
      version: process.env['APP_VERSION'] ?? '0.1.0',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response) {
    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'ok',
        dependencies: { database: 'up' },
        timestamp: new Date().toISOString(),
      };
    } catch {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        status: 'error',
        dependencies: { database: 'down' },
        timestamp: new Date().toISOString(),
      };
    }
  }
}
