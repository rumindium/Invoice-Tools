import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

function createController(query: () => Promise<unknown>): HealthController {
  const prisma = { $queryRaw: vi.fn(query) } as unknown as PrismaService;
  return new HealthController(prisma);
}

describe('HealthController', () => {
  it('reports liveness without touching the database', () => {
    const controller = createController(async () => []);
    const result = controller.live();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('rumindium-invoice-api');
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('reports readiness when the database answers', async () => {
    const controller = createController(async () => [{ '?column?': 1 }]);
    const response = { status: vi.fn() } as unknown as Response;

    const result = await controller.ready(response);

    expect(result.status).toBe('ok');
    expect(result.dependencies.database).toBe('up');
    expect(response.status).not.toHaveBeenCalled();
  });

  it('answers 503 when the database is down', async () => {
    const controller = createController(async () => {
      throw new Error('connection refused');
    });
    const response = { status: vi.fn() } as unknown as Response;

    const result = await controller.ready(response);

    expect(result.status).toBe('error');
    expect(result.dependencies.database).toBe('down');
    expect(response.status).toHaveBeenCalledWith(503);
  });
});
