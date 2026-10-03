const RENDER_DEADLINE_MS = 120000;
const SHUTDOWN_DEADLINE_MS = 10000;
const RECLAMATION_DEADLINE_MS = 1000;
const MAX_NATIVE_TIMEOUT_MS = 2147483647;

/** Wall-clock budgets owned by the validator, independent of renderer output. */
export default class MermaidValidationDeadline {
  readonly renderMs: number;
  readonly shutdownMs: number;
  readonly reclamationMs: number;

  constructor(renderMs = RENDER_DEADLINE_MS, shutdownMs = SHUTDOWN_DEADLINE_MS, reclamationMs = RECLAMATION_DEADLINE_MS) {
    for (const value of [renderMs, shutdownMs, reclamationMs]) {
      if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_NATIVE_TIMEOUT_MS) {
        throw new Error('Mermaid deadlines must be positive integer milliseconds');
      }
    }
    this.renderMs = renderMs;
    this.shutdownMs = shutdownMs;
    this.reclamationMs = reclamationMs;
    Object.freeze(this);
  }
}
