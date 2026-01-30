import NoOpLogger from '../../infrastructure/adapters/NoOpLogger.js';
import CachedValue from '../utils/CachedValue.js';

/**
 * Default TTL for health check cache in milliseconds.
 * @const {number}
 */
const DEFAULT_CACHE_TTL_MS = 5000;

/**
 * Health status constants.
 * @readonly
 * @enum {string}
 */
export const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
};

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
  /**
   * Creates a HealthCheckService instance.
   * @param {Object} options
   * @param {import('../../ports/GraphPersistencePort.js').default} options.persistence - Persistence port for repository checks
   * @param {import('../../ports/ClockPort.js').default} options.clock - Clock port for timing operations
   * @param {number} [options.cacheTtlMs=5000] - How long to cache health results in milliseconds
   * @param {import('../../ports/LoggerPort.js').default} [options.logger] - Logger for structured logging
   */
  constructor({ persistence, clock, cacheTtlMs = DEFAULT_CACHE_TTL_MS, logger = new NoOpLogger() }) {
    this._persistence = persistence;
    this._clock = clock;
    this._logger = logger;

    /** @type {import('./BitmapIndexReader.js').default|null} */
    this._indexReader = null;

    // Health check cache
    this._healthCache = new CachedValue({
      clock,
      ttlMs: cacheTtlMs,
      compute: () => this._computeHealth(),
    });
  }

  /**
   * Sets the index reader for index health checks.
   * Call this when an index is loaded.
   * @param {import('./BitmapIndexReader.js').default|null} reader - The index reader, or null to clear
   */
  setIndexReader(reader) {
    this._indexReader = reader;
    this._healthCache.invalidate();
  }

  /**
   * K8s-style liveness probe: Is the service running?
   *
   * Returns true if the repository is accessible.
   * A failed liveness check typically triggers a container restart.
   *
   * @returns {Promise<boolean>}
   */
  async isAlive() {
    const health = await this.getHealth();
    // Alive if repository is reachable (even if degraded)
    return health.components.repository.status !== HealthStatus.UNHEALTHY;
  }

  /**
   * K8s-style readiness probe: Can the service serve requests?
   *
   * Returns true if all critical components are healthy.
   * A failed readiness check removes the pod from load balancer.
   *
   * @returns {Promise<boolean>}
   */
  async isReady() {
    const health = await this.getHealth();
    return health.status === HealthStatus.HEALTHY;
  }

  /**
   * Gets detailed health information for all components.
   *
   * Results are cached for the configured TTL to prevent
   * excessive health check calls under load.
   *
   * @returns {Promise<HealthResult>}
   *
   * @typedef {Object} HealthResult
   * @property {'healthy'|'degraded'|'unhealthy'} status - Overall health status
   * @property {Object} components - Component health breakdown
   * @property {RepositoryHealth} components.repository - Repository health
   * @property {IndexHealth} components.index - Index health
   * @property {string} [cachedAt] - ISO timestamp if result is cached
   *
   * @typedef {Object} RepositoryHealth
   * @property {'healthy'|'unhealthy'} status - Repository status
   * @property {number} latencyMs - Ping latency in milliseconds
   *
   * @typedef {Object} IndexHealth
   * @property {'healthy'|'degraded'|'unhealthy'} status - Index status
   * @property {boolean} loaded - Whether an index is loaded
   * @property {number} [shardCount] - Number of shards (if loaded)
   */
  async getHealth() {
    const { value, cachedAt, fromCache } = await this._healthCache.getWithMetadata();

    if (cachedAt) {
      return { ...value, cachedAt };
    }

    // Log only for fresh computations
    if (!fromCache) {
      this._logger.debug('Health check completed', {
        operation: 'getHealth',
        status: value.status,
        repositoryStatus: value.components.repository.status,
        indexStatus: value.components.index.status,
      });
    }

    return value;
  }

  /**
   * Computes health by checking all components.
   * This is called by CachedValue when the cache is stale.
   * @returns {Promise<Object>}
   * @private
   */
  async _computeHealth() {
    // Check repository health
    const repositoryHealth = await this._checkRepository();

    // Check index health
    const indexHealth = this._checkIndex();

    // Determine overall status
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
   * @returns {Promise<RepositoryHealth>}
   * @private
   */
  async _checkRepository() {
    try {
      const pingResult = await this._persistence.ping();
      return {
        status: pingResult.ok ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
        latencyMs: Math.round(pingResult.latencyMs * 100) / 100, // Round to 2 decimal places
      };
    } catch (err) {
      this._logger.warn('Repository ping failed', {
        operation: 'checkRepository',
        error: err.message,
      });
      return {
        status: HealthStatus.UNHEALTHY,
        latencyMs: 0,
      };
    }
  }

  /**
   * Checks index health based on loaded state and shard count.
   * @returns {IndexHealth}
   * @private
   */
  _checkIndex() {
    if (!this._indexReader) {
      return {
        status: HealthStatus.DEGRADED,
        loaded: false,
      };
    }

    // Index is loaded - count shards
    const shardCount = this._indexReader.shardOids?.size ?? 0;

    return {
      status: HealthStatus.HEALTHY,
      loaded: true,
      shardCount,
    };
  }

  /**
   * Computes overall health status from component health.
   * @param {RepositoryHealth} repositoryHealth
   * @param {IndexHealth} indexHealth
   * @returns {'healthy'|'degraded'|'unhealthy'}
   * @private
   */
  _computeOverallStatus(repositoryHealth, indexHealth) {
    // If repository is unhealthy, overall is unhealthy
    if (repositoryHealth.status === HealthStatus.UNHEALTHY) {
      return HealthStatus.UNHEALTHY;
    }

    // If index is degraded (not loaded), overall is degraded
    if (indexHealth.status === HealthStatus.DEGRADED) {
      return HealthStatus.DEGRADED;
    }

    // All components healthy
    return HealthStatus.HEALTHY;
  }
}
