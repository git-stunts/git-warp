import type { ReportOutput } from '../../benchmarks/cone-showcase/WitnessReport.ts';

type WriteDone = (error?: Error | null) => void;

/** Keeps every framed record a WitnessReport writes, or refuses writes with one error. */
export default class ConeShowcaseReportOutput implements ReportOutput {
  readonly #chunks: string[] = [];
  readonly #failure: Error | null;

  constructor(failure: Error | null = null) {
    this.#failure = failure;
  }

  get lines(): readonly string[] {
    return Object.freeze(this.#chunks.join('').split('\n').filter((line) => line !== ''));
  }

  write(chunk: string | Uint8Array, encodingOrDone?: string | WriteDone, done?: WriteDone): boolean {
    if (this.#failure === null) {
      this.#chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    }
    const callback = typeof encodingOrDone === 'function' ? encodingOrDone : done;
    callback?.(this.#failure);
    return this.#failure === null;
  }
}
