import type RandomPort from '../../src/ports/RandomPort.ts';

/**
 * Deterministic RandomPort for tests that need well-spread bytes: an
 * xorshift32 stream from `seed`. Use SequenceRandomPort when a test needs
 * exact, readable byte values instead.
 */
export default class SeededRandomPort implements RandomPort {
  private state: number;

  constructor(seed = 123_456_789) {
    this.state = seed >>> 0;
  }

  randomBytes(length: number): Uint8Array {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      this.state ^= this.state << 13; this.state >>>= 0;
      this.state ^= this.state >> 17; this.state >>>= 0;
      this.state ^= this.state << 5; this.state >>>= 0;
      out[i] = this.state & 0xff;
    }
    return out;
  }
}
