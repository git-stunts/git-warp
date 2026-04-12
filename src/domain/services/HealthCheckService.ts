import nullLogger from '../utils/nullLogger.ts';
import CachedValue from '../utils/CachedValue.ts';
import type CommitPort from '../../ports/CommitPort.ts';
import type ClockPort from '../../ports/ClockPort.ts';
import type LoggerPort from '../../ports/LoggerPort.ts';

/**
 * Default TTL for health check cache in milliseconds.
 */
const DEFAULT_CACHE_TTL_MS = 5000;

/**
 * Health status constants.
 */
export const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
} as const;

export type HealthStatusValue = typeof HealthStatus[keyof typeof HealthStatus];

export interface RepositoryHealth {
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
}

export interface IndexHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  loaded: boolean;
  shardCount?: number;
}

export interface HealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    repository: RepositoryHealth;
    index: IndexHealth;
  };
  cachedAt?: string;
}

interface IndexReaderLike {
  shardOids?: { size: number };
}

/**
 * Service for performing health checks on the graph system.
 *
 * Follows hexagonal architecture by depending on ports, not adapters.
 * Provides K8s-style probes (liveness vs readiness) and detailed component health.
 *
 * @example
 * const healthService = new HealthCheckService({
 *   persistence,
 *   clock,
 *   cacheTtlMs: 10000,
 *   logger,
 * });
 *
 * // K8s liveness probe - am I running?
 * const alive = await healthService.isAlive();
 *
 * // K8s readiness probe - can I serve requests?
 * const ready = await healthService.isReady();
 *
 * // Detailed health breakdown
 * const health = await healthService.getHealth();
 * console.log(health.status); // 'healthy' | 'degraded' | 'unhealthy'
 */
export default class HealthCheckService {
  private readonly _persistence: CommitPort;
  private readonly _logger: LoggerPort;
  private _indexReader: IndexReaderLike | null;
  private readonly _healthCache: CachedValue<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: { repository: RepositoryHealth; index: IndexHealth };
  }>;

  /**
   * Creates a HealthCheckService instance.
   */
  constructor({
    persistence,
    clock,
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    logger = nullLogger,
  }: {
    persistence: CommitPort;
    clock: ClockPort;
    cacheTtlMs?: number;
    logger?: LoggerPort;
  }) {
    this._persistence = persistence;
    this._logger = logger;
    this._indexReader = null;

    this._healthCache = new CachedValue({
      clock,
      ttlMs: cacheTtlMs,
      compute: () => this._computeHealth(),
    });
  }

  /**
   * Sets the index reader for index health checks.
   * Call this when an index is loaded.
   *
   * @param reader - The index reader, or null to clear
   */
  setIndexReader(reader: IndexReaderLike | null): void {
    this._indexReader = reader;
    this._healthCache.invalidate();
  }

  /**
   * K8s-style liveness probe: Is the service running?
   *
   * Returns true if the repository is accessible.
   * A failed liveness check typically triggers a container restart.
   */
  async isAlive(): Promise<boolean> {
    const health = await this.getHealth();
    // Alive if repository is reachable (even if degraded)
    return health.components.repository.status !== HealthStatus.UNHEALTHY;
  }

  /**
   * K8s-style readiness probe: Can the service serve requests?
   *
   * Returns true if all critical components are healthy.
   * A failed readiness check removes the pod from load balancer.
   */
  async isReady(): Promise<boolean> {
    const health = await this.getHealth();
    return health.status === HealthStatus.HEALTHY;
  }

  /**
   * Gets detailed health information for all components.
   *
   * Results are cached for the configured TTL to prevent
   * excessive health check calls under load.
   */
  async getHealth(): Promise<HealthResult> {
    const { value, cachedAt, fromCache } = await this._healthCache.getWithMetadata();
    const result = value as HealthResult;

    if (typeof cachedAt === 'string' && cachedAt.length > 0) {
      return { ...result, cachedAt };
    }

    // Log only for fresh computations
    if (!fromCache) {
      this._logger.debug('Health check completed', {
        operation: 'getHealth',
        status: result.status,
        repositoryStatus: result.components.repository.status,
        indexStatus: result.components.index.status,
      });
    }

    return result;
  }

  /**
   * Computes health by checking all components.
   * This is called by CachedValue when the cache is stale.
   */
  private async _computeHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: { repository: RepositoryHealth; index: IndexHealth };
  }> {
    const repositoryHealth = await this._checkRepository();
    const indexHealth = this._checkIndex();
    const status = this._computeOverallStatus(repositoryHealth, indexHealth);

    return {
      status,
      components: {
        repository: repositoryHealth,
        index: indexHealth,
      },
    };
  }

  /**
   * Checks repository health by pinging the persistence layer.
   */
  private async _checkRepository(): Promise<RepositoryHealth> {
    try {
      const pingResult = await this._persistence.ping();
      return {
        status: pingResult.ok ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
        latencyMs: Math.round(pingResult.latencyMs * 100) / 100,
      };
    } catch (err) {
      this._logger.warn('Repository ping failed', {
        operation: 'checkRepository',
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        status: HealthStatus.UNHEALTHY,
        latencyMs: 0,
      };
    }
  }

  /**
   * Checks index health based on loaded state and shard count.
   */
  private _checkIndex(): IndexHealth {
    if (!this._indexReader) {
      return {
        status: HealthStatus.DEGRADED,
        loaded: false,
      };
    }

    const shardCount = this._indexReader.shardOids?.size ?? 0;

    return {
      status: HealthStatus.HEALTHY,
      loaded: true,
      shardCount,
    };
  }

  /**
   * Computes overall health status from component health.
   */
  private _computeOverallStatus(
    repositoryHealth: RepositoryHealth,
    indexHealth: IndexHealth,
  ): 'healthy' | 'degraded' | 'unhealthy' {
    if (repositoryHealth.status === HealthStatus.UNHEALTHY) {
      return HealthStatus.UNHEALTHY;
    }

    if (indexHealth.status === HealthStatus.DEGRADED) {
      return HealthStatus.DEGRADED;
    }

    return HealthStatus.HEALTHY;
  }
}
