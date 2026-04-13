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

import type LoggerPort from '../../ports/LoggerPort.ts';

export default class LoggerObservabilityBridge {
  private readonly _logger: LoggerPort;

  /** Creates a bridge that forwards CAS observability events to the given logger. */
  constructor(logger: LoggerPort) {
    this._logger = logger;
  }

  /** Forward a metric as a debug-level log with structured context. */
  metric(channel: string, data: Record<string, unknown>): void {
    this._logger.debug(`cas:metric:${channel}`, data);
  }

  /** Forward a log call to the corresponding LoggerPort level method. */
  log(level: 'debug' | 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>): void {
    this._logger[level](msg, meta);
  }

  /**
   * Start a named span. Returns an object with `end()` that logs
   * span duration as a debug metric.
   */
  span(name: string): { end(meta?: Record<string, unknown>): void } {
    const start = performance.now();
    return {
      end: (meta?: Record<string, unknown>) => {
        const durationMs = performance.now() - start;
        this._logger.debug(`cas:span:${name}`, { ...meta, durationMs });
      },
    };
  }
}
