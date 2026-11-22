import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';
import { DatabaseService } from '../database/database.service';

describe('HealthService', () => {
  it('returns ok when database is up', async () => {
    const database = {
      health: jest.fn().mockResolvedValue({ ok: true }),
    } as unknown as DatabaseService;
    const service = new HealthService(database);
    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('throws when database is down', async () => {
    const database = {
      health: jest.fn().mockRejectedValue(new Error('down')),
    } as unknown as DatabaseService;
    const service = new HealthService(database);
    await expect(service.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
