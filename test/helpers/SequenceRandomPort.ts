import type RandomPort from '../../src/ports/RandomPort.ts';

/**
 * Deterministic RandomPort for tests: emits consecutive byte values
 * (`start`, `start + 1`, ...) modulo 256, continuing across calls, and
 * records every requested length.
 */
export default class SequenceRandomPort implements RandomPort {
  readonly requests: number[] = [];
  private next: number;

  constructor(start = 0) {
    this.next = start;
  }

  randomBytes(length: number): Uint8Array {
    this.requests.push(length);
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      out[i] = this.next & 0xff;
      this.next++;
    }
    return out;
  }
}
