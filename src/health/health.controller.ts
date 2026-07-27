import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Health endpoints, deliberately split in two because they cost different
 * things to call:
 *
 * - `/health` is liveness. It touches nothing, so an uptime monitor can poll
 *   it every minute forever. On Fly this is also what keeps the machine awake
 *   (`auto_stop_machines`), which is the point during a sale.
 * - `/health/db` is readiness. It runs `SELECT 1`, which also WAKES A SUSPENDED
 *   NEON COMPUTE. That is the whole reason it exists: warming the database
 *   before an on-sale opens. Do NOT point a 24/7 monitor at it — on Neon's free
 *   plan a permanently awake compute burns the monthly compute-hour quota, and
 *   Neon's answer to an exhausted quota is to cut you off, not to bill you.
 *   Poll it only inside the sale window.
 *
 * Both skip the global throttler so monitoring can never eat a buyer's budget.
 */
@ApiTags('health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({ summary: 'Liveness — process is up. Does not touch the DB.' })
  @ApiResponse({ status: 200 })
  live(): { status: string; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.floor(process.uptime()) };
  }

  @Get('db')
  @ApiOperation({
    summary: 'Readiness — verifies the database answers. Wakes a suspended Neon compute.',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 503, description: 'Database unreachable' })
  async ready(): Promise<{ status: string; dbLatencyMs: number }> {
    const startedAt = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      // Swallow the driver message on purpose — this endpoint is public and
      // the connection string must not leak into an error body.
      throw new ServiceUnavailableException('database unreachable');
    }
    return { status: 'ok', dbLatencyMs: Date.now() - startedAt };
  }
}
