import type { V18MigrationProgress, V18MigrationProgressReporter } from './V18MigrationProgress.ts';

export const V18_MIGRATION_PROGRESS_RENDER_INTERVAL_MS = 100;

/**
 * Preserves per-item progress truth while bounding host rendering work.
 *
 * The first event is delivered immediately. During each render window, the
 * newest event replaces older pending events. Phase, writer, and message
 * transitions flush the prior stream so named migration steps are never
 * hidden. Flush delivers the final pending event synchronously and cancels
 * scheduled work before a terminal result.
 */
export default class V18MigrationProgressCoalescer {
  readonly #intervalMs: number;
  readonly #reporter: V18MigrationProgressReporter;
  #hasStream = false;
  #message: string | null = null;
  #phase: V18MigrationProgress['phase'] | null = null;
  #pending: V18MigrationProgress | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #writer: string | undefined;

  constructor(
    reporter: V18MigrationProgressReporter,
    intervalMs: number = V18_MIGRATION_PROGRESS_RENDER_INTERVAL_MS
  ) {
    if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
      throw new RangeError('migration progress render interval must be a positive integer');
    }
    this.#intervalMs = intervalMs;
    this.#reporter = reporter;
  }

  report(progress: V18MigrationProgress): void {
    if (this.#changesStream(progress)) {
      this.#finishWindow();
    }
    this.#hasStream = true;
    this.#message = progress.message;
    this.#phase = progress.phase;
    this.#writer = progress.writer;
    this.#pending = progress;
    if (this.#timer === null) {
      this.#deliverPending();
      this.#scheduleWindow();
    }
  }

  flush(): void {
    this.#finishWindow();
  }

  flushBestEffort(): void {
    try {
      this.flush();
    } catch {
      // Terminal progress rendering must not replace the migration outcome.
    }
  }

  #changesStream(progress: V18MigrationProgress): boolean {
    return (
      this.#hasStream
      && (
        progress.message !== this.#message
        || progress.phase !== this.#phase
        || progress.writer !== this.#writer
      )
    );
  }

  #finishWindow(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    this.#deliverPending();
  }

  #deliverPending(): void {
    const progress = this.#pending;
    if (progress === null) {
      return;
    }
    this.#pending = null;
    this.#reporter(progress);
  }

  #scheduleWindow(): void {
    this.#timer = setTimeout(() => {
      this.#timer = null;
      if (this.#pending !== null) {
        try {
          this.#deliverPending();
        } catch {
          // Scheduled progress rendering must not terminate the migration.
        }
        this.#scheduleWindow();
      }
    }, this.#intervalMs);
  }
}
