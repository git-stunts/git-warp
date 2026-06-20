/**
 * LoggerObservabilityBridge — bridges git-cas's ObservabilityPort to
 * git-warp's LoggerPort.
 *
 * Translates ObservabilityPort calls (metric, log, span) into LoggerPort
 * calls so that CAS operations surface through git-warp's existing
 * structured logging infrastructure.
 *
 * Adapter responsibility: incoming `Record<string, unknown>` contexts
 * from the observability side are narrowed into `LogFields` at this
 * boundary. Every value is passed through `toLogFieldValue` which
 * preserves primitives, serializes unsupported shapes to strings, and
 * recursively walks nested records.
 *
 * @module infrastructure/adapters/LoggerObservabilityBridge
 */

import type LoggerPort from '../../ports/LoggerPort.ts';
import type LogFields from '../../domain/types/log/LogFields.ts';
import type LogFieldValue from '../../domain/types/log/LogFieldValue.ts';
import WarpError from '../../domain/errors/WarpError.ts';

/**
 * Narrows a raw `Record<string, unknown>` context into the typed
 * `LogFields` shape expected by LoggerPort.
 *
 * Unsupported shapes (functions, symbols, class instances that are
 * not Error/Date/Uint8Array) are rendered to string so the log
 * stream remains transport-honest.
 */
function toLogFields(raw: Record<string, unknown> | undefined): LogFields | undefined {
  if (raw === undefined) { return undefined; }
  const out: { [key: string]: LogFieldValue } = {};
  for (const key of Object.keys(raw)) {
    out[key] = toLogFieldValue(raw[key]);
  }
  return out;
}

const PRIMITIVE_KINDS: ReadonlySet<string> = new Set(['string', 'number', 'boolean', 'bigint']);
const BOXED_PASSTHROUGH: ReadonlyArray<Function> = [Uint8Array, Error, Date];

function isBoxedPassthrough(value: object): boolean {
  return BOXED_PASSTHROUGH.some((T) => value instanceof (T as new (...args: never[]) => object));
}

function toObjectField(value: object): LogFieldValue {
  if (isBoxedPassthrough(value)) { return value as LogFieldValue; }
  return toLogFields(value as Record<string, unknown>) ?? {};
}

function toUnsupportedField(value: unknown): string {
  return typeof value === 'symbol' ? value.toString() : `[unsupported:${typeof value}]`;
}

function toNonNullField(value: object | string | number | boolean | bigint | symbol): LogFieldValue {
  if (PRIMITIVE_KINDS.has(typeof value)) { return value as LogFieldValue; }
  if (Array.isArray(value)) { return value.map(toLogFieldValue); }
  if (typeof value === 'object') { return toObjectField(value); }
  return toUnsupportedField(value);
}

function toLogFieldValue(value: unknown): LogFieldValue {
  if (value === null || value === undefined) { return value; }
  return toNonNullField(value as object | string | number | boolean | bigint | symbol);
}

export default class LoggerObservabilityBridge {
  private readonly _logger: LoggerPort;

  /** Creates a bridge that forwards CAS observability events to the given logger. */
  constructor(logger: LoggerPort) {
    if (logger === null || logger === undefined) {
      throw new WarpError(
        'LoggerObservabilityBridge requires a logger',
        'E_OBSERVABILITY_LOGGER_REQUIRED',
      );
    }
    this._logger = logger;
  }

  /** Forward a metric as a debug-level log with structured context. */
  metric(channel: string, data: Record<string, unknown>): void {
    this._logger.debug(`cas:metric:${channel}`, toLogFields(data));
  }

  /** Forward a log call to the corresponding LoggerPort level method. */
  log(level: 'debug' | 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>): void {
    this._logger[level](msg, toLogFields(meta));
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
        const fields = toLogFields(meta) ?? {};
        this._logger.debug(`cas:span:${name}`, { ...fields, durationMs });
      },
    };
  }
}
