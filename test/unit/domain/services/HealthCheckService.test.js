import { describe, it, expect, vi, beforeEach } from 'vitest';
import HealthCheckService, { HealthStatus } from '../../../../src/domain/services/HealthCheckService.js';

describe('HealthCheckService', () => {
  /** @type {any} */
  /** @type {any} */
  let service;
  /** @type {any} */
  /** @type {any} */
  let mockPersistence;
  /** @type {any} */
  /** @type {any} */
  let mockClock;
  /** @type {any} */
  /** @type {any} */
  let mockIndexReader;
  /** @type {any} */
  /** @type {any} */
  let mockLogger;
  /** @type {any} */
  /** @type {any} */
  let currentTime;

  beforeEach(() => {
    currentTime = 0;

    mockPersistence = {
      ping: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1.5 }),
    };

    mockClock = {
      now: vi.fn(() => currentTime),
      timestamp: vi.fn(() => '2024-01-15T10:00:00.000Z'),
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

    service = new HealthCheckService(/** @type {any} */ ({
      persistence: mockPersistence,
      clock: mockClock,
      cacheTtlMs: 5000,
      logger: mockLogger,
    }));
  });

  describe('constructor', () => {
    it('accepts persistence, clock, and optional parameters', () => {
      const s = new HealthCheckService(/** @type {any} */ ({ persistence: mockPersistence, clock: mockClock }));
      expect(s).toBeDefined();
    });

    it('uses default cache TTL of 5000ms', async () => {
      const s = new HealthCheckService(/** @type {any} */ ({ persistence: mockPersistence, clock: mockClock }));
      await s.getHealth();

      // Call again immediately - should be cached
      mockPersistence.ping.mockClear();
      await s.getHealth();
      expect(mockPersistence.ping).not.toHaveBeenCalled();

      // Advance past default TTL
      currentTime = 5001;
      await s.getHealth();
      expect(mockPersistence.ping).toHaveBeenCalled();
    });

    it('allows custom cache TTL', async () => {
      const s = new HealthCheckService(/** @type {any} */ ({
        persistence: mockPersistence,
        clock: mockClock,
        cacheTtlMs: 1000,
      }));
      await s.getHealth();

      // Advance 1.5 seconds - should expire
      currentTime = 1500;
      mockPersistence.ping.mockClear();
      await s.getHealth();
      expect(mockPersistence.ping).toHaveBeenCalled();
    });
  });

  describe('getHealth() - healthy scenario', () => {
    it('returns healthy status when repository and index are working', async () => {
      service.setIndexReader(mockIndexReader);

      const health = await service.getHealth();

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

      const health = await service.getHealth();

      expect(health.components.index.shardCount).toBe(5);
    });
  });

  describe('getHealth() - degraded scenario', () => {
    it('returns degraded status when index is not loaded', async () => {
      // No index reader set

      const health = await service.getHealth();

      expect(health.status).toBe(HealthStatus.DEGRADED);
      expect(health.components.repository.status).toBe(HealthStatus.HEALTHY);
      expect(health.components.index.status).toBe(HealthStatus.DEGRADED);
      expect(health.components.index.loaded).toBe(false);
      expect(health.components.index.shardCount).toBeUndefined();
    });

    it('clears index when setIndexReader is called with null', async () => {
      service.setIndexReader(mockIndexReader);
      let health = await service.getHealth();
      expect(health.components.index.loaded).toBe(true);

      // Clear the index (invalidates cache automatically)
      service.setIndexReader(null);
      health = await service.getHealth();

      expect(health.status).toBe(HealthStatus.DEGRADED);
      expect(health.components.index.loaded).toBe(false);
    });
  });

  describe('getHealth() - unhealthy scenario', () => {
    it('returns unhealthy status when repository ping fails', async () => {
      mockPersistence.ping.mockResolvedValue({ ok: false, latencyMs: 50 });

      const health = await service.getHealth();

      expect(health.status).toBe(HealthStatus.UNHEALTHY);
      expect(health.components.repository.status).toBe(HealthStatus.UNHEALTHY);
      expect(health.components.repository.latencyMs).toBe(50);
    });

    it('returns unhealthy status when ping throws an error', async () => {
      mockPersistence.ping.mockRejectedValue(new Error('Connection refused'));

      const health = await service.getHealth();

      expect(health.status).toBe(HealthStatus.UNHEALTHY);
      expect(health.components.repository.status).toBe(HealthStatus.UNHEALTHY);
      expect(health.components.repository.latencyMs).toBe(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Repository ping failed',
        expect.objectContaining({ error: 'Connection refused' })
      );
    });

    it('unhealthy repository takes precedence over degraded index', async () => {
      mockPersistence.ping.mockResolvedValue({ ok: false, latencyMs: 100 });
      // No index loaded (would normally be degraded)

      const health = await service.getHealth();

      // Overall should be unhealthy, not degraded
      expect(health.status).toBe(HealthStatus.UNHEALTHY);
    });
  });

  describe('caching behavior', () => {
    it('caches health results for TTL duration', async () => {
      service.setIndexReader(mockIndexReader);

      // First call
      const health1 = await service.getHealth();
      expect(mockPersistence.ping).toHaveBeenCalledTimes(1);

      // Second call immediately - should use cache
      const health2 = await service.getHealth();
      expect(mockPersistence.ping).toHaveBeenCalledTimes(1);
      expect(health2.cachedAt).toBeDefined();

      // Verify results are the same
      expect(health1.status).toBe(health2.status);
    });

    it('refreshes health after TTL expires', async () => {
      // First call
      await service.getHealth();
      expect(mockPersistence.ping).toHaveBeenCalledTimes(1);

      // Advance time past TTL
      currentTime = 6000;

      // Should make a new ping call
      await service.getHealth();
      expect(mockPersistence.ping).toHaveBeenCalledTimes(2);
    });

    it('includes cachedAt timestamp for cached results', async () => {
      mockClock.timestamp.mockReturnValue('2024-01-15T10:00:00.000Z');

      await service.getHealth();

      // Second call should include cachedAt
      const health = await service.getHealth();
      expect(health.cachedAt).toBe('2024-01-15T10:00:00.000Z');
    });

    it('invalidates cache when index reader changes', async () => {
      // Initial health check
      await service.getHealth();
      expect(mockPersistence.ping).toHaveBeenCalledTimes(1);

      // Set index reader - should invalidate cache
      service.setIndexReader(mockIndexReader);

      // Should make a new call (cache invalidated)
      await service.getHealth();
      expect(mockPersistence.ping).toHaveBeenCalledTimes(2);
    });
  });

  describe('isReady()', () => {
    it('returns true when all components are healthy', async () => {
      service.setIndexReader(mockIndexReader);

      const ready = await service.isReady();

      expect(ready).toBe(true);
    });

    it('returns false when index is not loaded (degraded)', async () => {
      // No index loaded

      const ready = await service.isReady();

      expect(ready).toBe(false);
    });

    it('returns false when repository is unhealthy', async () => {
      mockPersistence.ping.mockResolvedValue({ ok: false, latencyMs: 10 });
      service.setIndexReader(mockIndexReader);

      const ready = await service.isReady();

      expect(ready).toBe(false);
    });
  });

  describe('isAlive()', () => {
    it('returns true when repository is healthy', async () => {
      const alive = await service.isAlive();

      expect(alive).toBe(true);
    });

    it('returns true even when index is degraded', async () => {
      // No index loaded - degraded state

      const alive = await service.isAlive();

      expect(alive).toBe(true);
    });

    it('returns false when repository is unhealthy', async () => {
      mockPersistence.ping.mockResolvedValue({ ok: false, latencyMs: 10 });

      const alive = await service.isAlive();

      expect(alive).toBe(false);
    });

    it('returns false when ping throws an error', async () => {
      mockPersistence.ping.mockRejectedValue(new Error('Network error'));

      const alive = await service.isAlive();

      expect(alive).toBe(false);
    });
  });

  describe('latency rounding', () => {
    it('rounds latency to 2 decimal places', async () => {
      mockPersistence.ping.mockResolvedValue({ ok: true, latencyMs: 1.23456789 });

      const health = await service.getHealth();

      expect(health.components.repository.latencyMs).toBe(1.23);
    });
  });

  describe('HealthStatus constants', () => {
    it('exports correct status values', () => {
      expect(HealthStatus.HEALTHY).toBe('healthy');
      expect(HealthStatus.DEGRADED).toBe('degraded');
      expect(HealthStatus.UNHEALTHY).toBe('unhealthy');
    });
  });

  describe('logging', () => {
    it('logs debug message on health check completion', async () => {
      service.setIndexReader(mockIndexReader);

      await service.getHealth();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Health check completed',
        expect.objectContaining({
          operation: 'getHealth',
          status: 'healthy',
          repositoryStatus: 'healthy',
          indexStatus: 'healthy',
        })
      );
    });
  });
});
