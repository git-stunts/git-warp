import { describe, it, expect, vi, beforeEach } from 'vitest';
import HealthCheckService, { HealthStatus } from '../../../../src/domain/services/HealthCheckService.ts';

describe('HealthCheckService', () => {
  let service: HealthCheckService;
  let mockPersistence: { ping: ReturnType<typeof vi.fn> };
  let mockIndexReader: { shardOids: Map<string, string> };
  let mockLogger: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    mockPersistence = {
      ping: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1.5 }),
    };

    mockIndexReader = {
      shardOids: new Map([
        ['meta_00.json', 'oid1'],
        ['meta_01.json', 'oid2'],
        ['shards_fwd_00.json', 'oid3'],
      ]),
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    };

    service = new HealthCheckService(({
      persistence: mockPersistence,
      cacheTtlTicks: 100,
      logger: mockLogger,
    }) as unknown as ConstructorParameters<typeof HealthCheckService>[0]);
  });

  describe('constructor', () => {
    it('accepts persistence and optional parameters', () => {
      const s = new HealthCheckService(({ persistence: mockPersistence }) as unknown as ConstructorParameters<typeof HealthCheckService>[0]);
      expect(s).toBeDefined();
    });

    it('uses default cache TTL of 50 ticks', async () => {
      const s = new HealthCheckService(({ persistence: mockPersistence }) as unknown as ConstructorParameters<typeof HealthCheckService>[0]);
      await s.getHealth(10);

      // Call again at same tick — should be cached
      mockPersistence.ping.mockClear();
      await s.getHealth(10);
      expect(mockPersistence.ping).not.toHaveBeenCalled();

      // Advance past default TTL (50 ticks)
      await s.getHealth(61);
      expect(mockPersistence.ping).toHaveBeenCalled();
    });

    it('allows custom cache TTL in ticks', async () => {
      const s = new HealthCheckService(({
        persistence: mockPersistence,
        cacheTtlTicks: 20,
      }) as unknown as ConstructorParameters<typeof HealthCheckService>[0]);
      await s.getHealth(10);

      // Advance 25 ticks — should expire
      mockPersistence.ping.mockClear();
      await s.getHealth(35);
      expect(mockPersistence.ping).toHaveBeenCalled();
    });
  });

  describe('getHealth() - healthy scenario', () => {
    it('returns healthy status when repository and index are working', async () => {
      service.setIndexReader(mockIndexReader);

      const health = await service.getHealth(1);

      expect(health.status).toBe(HealthStatus.HEALTHY);
      expect(health.components.repository.status).toBe(HealthStatus.HEALTHY);
      expect(health.components.repository.latencyMs).toBeCloseTo(1.5, 1);
      expect(health.components.index.status).toBe(HealthStatus.HEALTHY);
      expect(health.components.index.loaded).toBe(true);
      expect(health.components.index.shardCount).toBe(3);
    });

    it('includes shard count from index reader', async () => {
      const readerWith5Shards = {
        shardOids: new Map([
          ['meta_00.json', 'a'],
          ['meta_01.json', 'b'],
          ['meta_02.json', 'c'],
          ['shards_fwd_00.json', 'd'],
          ['shards_rev_00.json', 'e'],
        ]),
      };
      service.setIndexReader(readerWith5Shards);

      const health = await service.getHealth(1);

      expect(health.components.index.shardCount).toBe(5);
    });
  });

  describe('getHealth() - degraded scenario', () => {
    it('returns degraded status when index is not loaded', async () => {
      const health = await service.getHealth(1);

      expect(health.status).toBe(HealthStatus.DEGRADED);
      expect(health.components.repository.status).toBe(HealthStatus.HEALTHY);
      expect(health.components.index.status).toBe(HealthStatus.DEGRADED);
      expect(health.components.index.loaded).toBe(false);
      expect(health.components.index.shardCount).toBeUndefined();
    });

    it('clears index when setIndexReader is called with null', async () => {
      service.setIndexReader(mockIndexReader);
      let health = await service.getHealth(1);
      expect(health.components.index.loaded).toBe(true);

      service.setIndexReader(null);
      health = await service.getHealth(2);

      expect(health.status).toBe(HealthStatus.DEGRADED);
      expect(health.components.index.loaded).toBe(false);
    });
  });

  describe('getHealth() - unhealthy scenario', () => {
    it('returns unhealthy status when repository ping fails', async () => {
      mockPersistence.ping.mockResolvedValue({ ok: false, latencyMs: 50 });

      const health = await service.getHealth(1);

      expect(health.status).toBe(HealthStatus.UNHEALTHY);
      expect(health.components.repository.status).toBe(HealthStatus.UNHEALTHY);
      expect(health.components.repository.latencyMs).toBe(50);
    });

    it('returns unhealthy status when ping throws an error', async () => {
      mockPersistence.ping.mockRejectedValue(new Error('Connection refused'));

      const health = await service.getHealth(1);

      expect(health.status).toBe(HealthStatus.UNHEALTHY);
      expect(health.components.repository.status).toBe(HealthStatus.UNHEALTHY);
      expect(health.components.repository.latencyMs).toBe(0);
      expect(mockLogger['warn']).toHaveBeenCalledWith(
        'Repository ping failed',
        expect.objectContaining({ error: 'Connection refused' }),
      );
    });

    it('unhealthy repository takes precedence over degraded index', async () => {
      mockPersistence.ping.mockResolvedValue({ ok: false, latencyMs: 100 });

      const health = await service.getHealth(1);

      expect(health.status).toBe(HealthStatus.UNHEALTHY);
    });
  });

  describe('caching behavior', () => {
    it('caches health results for tick TTL duration', async () => {
      service.setIndexReader(mockIndexReader);

      const health1 = await service.getHealth(10);
      expect(mockPersistence.ping).toHaveBeenCalledTimes(1);

      // Second call at tick 20 — within 100-tick threshold
      const health2 = await service.getHealth(20);
      expect(mockPersistence.ping).toHaveBeenCalledTimes(1);
      expect(health2.cachedAtTick).toBeDefined();

      expect(health1.status).toBe(health2.status);
    });

    it('refreshes health after tick TTL expires', async () => {
      await service.getHealth(10);
      expect(mockPersistence.ping).toHaveBeenCalledTimes(1);

      // Advance past 100-tick threshold
      await service.getHealth(120);
      expect(mockPersistence.ping).toHaveBeenCalledTimes(2);
    });

    it('includes cachedAtTick for cached results', async () => {
      await service.getHealth(42);

      const health = await service.getHealth(50);
      expect(health.cachedAtTick).toBe(42);
    });

    it('invalidates cache when index reader changes', async () => {
      await service.getHealth(10);
      expect(mockPersistence.ping).toHaveBeenCalledTimes(1);

      service.setIndexReader(mockIndexReader);

      await service.getHealth(11);
      expect(mockPersistence.ping).toHaveBeenCalledTimes(2);
    });
  });

  describe('isReady()', () => {
    it('returns true when all components are healthy', async () => {
      service.setIndexReader(mockIndexReader);

      const ready = await service.isReady(1);

      expect(ready).toBe(true);
    });

    it('returns false when index is not loaded (degraded)', async () => {
      const ready = await service.isReady(1);

      expect(ready).toBe(false);
    });

    it('returns false when repository is unhealthy', async () => {
      mockPersistence.ping.mockResolvedValue({ ok: false, latencyMs: 10 });
      service.setIndexReader(mockIndexReader);

      const ready = await service.isReady(1);

      expect(ready).toBe(false);
    });
  });

  describe('isAlive()', () => {
    it('returns true when repository is healthy', async () => {
      const alive = await service.isAlive(1);

      expect(alive).toBe(true);
    });

    it('returns true even when index is degraded', async () => {
      const alive = await service.isAlive(1);

      expect(alive).toBe(true);
    });

    it('returns false when repository is unhealthy', async () => {
      mockPersistence.ping.mockResolvedValue({ ok: false, latencyMs: 10 });

      const alive = await service.isAlive(1);

      expect(alive).toBe(false);
    });

    it('returns false when ping throws an error', async () => {
      mockPersistence.ping.mockRejectedValue(new Error('Network error'));

      const alive = await service.isAlive(1);

      expect(alive).toBe(false);
    });
  });

  describe('latency rounding', () => {
    it('rounds latency to 2 decimal places', async () => {
      mockPersistence.ping.mockResolvedValue({ ok: true, latencyMs: 1.23456789 });

      const health = await service.getHealth(1);

      expect(health.components.repository.latencyMs).toBe(1.23);
    });

    it('rounds high latency values', async () => {
      mockPersistence.ping.mockResolvedValue({ ok: true, latencyMs: 99.999 });

      const health = await service.getHealth(1);

      expect(health.components.repository.latencyMs).toBe(100);
    });
  });

  describe('logging', () => {
    it('logs debug message for fresh health computation', async () => {
      await service.getHealth(1);

      expect(mockLogger['debug']).toHaveBeenCalledWith(
        'Health check completed',
        expect.objectContaining({
          operation: 'getHealth',
          status: expect.any(String),
        }),
      );
    });

    it('does not log for cached results', async () => {
      await service.getHealth(1);
      mockLogger['debug']!.mockClear();

      await service.getHealth(2);

      expect(mockLogger['debug']).not.toHaveBeenCalled();
    });
  });
});
