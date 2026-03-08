/**
 * LoggerObservabilityBridge — bridges git-cas's ObservabilityPort to
 * git-warp's LoggerPort.
 *
 * Translates ObservabilityPort calls (metric, log, span) into LoggerPort
 * calls so that CAS operations surface through git-warp's existing
 * structured logging infrastructure.
 *
 * @module infrastructure/adapters/LoggerObservabilityBridge
 */

/**
 * @typedef {import('../../ports/LoggerPort.js').default} LoggerPort
 */

export default class LoggerObservabilityBridge {
  /**
   * @param {LoggerPort} logger
   */
  constructor(logger) {
    this._logger = logger;
  }

  /**
   * Forward a metric as a debug-level log with structured context.
   *
   * @param {string} channel
   * @param {Record<string, unknown>} data
   */
  metric(channel, data) {
    this._logger.debug(`cas:metric:${channel}`, data);
  }

  /**
   * Forward a log call to the corresponding LoggerPort level method.
   *
   * @param {'debug'|'info'|'warn'|'error'} level
   * @param {string} msg
   * @param {Record<string, unknown>} [meta]
   */
  log(level, msg, meta) {
    this._logger[level](msg, meta);
  }

  /**
   * Start a named span. Returns an object with `end()` that logs
   * span duration as a debug metric.
   *
   * @param {string} name
   * @returns {{ end(meta?: Record<string, unknown>): void }}
   */
  span(name) {
    const start = performance.now();
    return {
      end: (meta) => {
        const durationMs = performance.now() - start;
        this._logger.debug(`cas:span:${name}`, { ...meta, durationMs });
      },
    };
  }
}
