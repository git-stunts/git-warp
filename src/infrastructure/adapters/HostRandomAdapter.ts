import type RandomPort from '../../ports/RandomPort.ts';

/** Web Crypto rejects a single `getRandomValues` request above this many bytes. */
const MAX_DRAW_BYTES = 65_536;

/** RandomPort backed by the host's Web Crypto CSPRNG (Node, Deno, Bun, browsers). */
export default class HostRandomAdapter implements RandomPort {
  randomBytes(length: number): Uint8Array {
    const out = new Uint8Array(length);
    for (let offset = 0; offset < length; offset += MAX_DRAW_BYTES) {
      globalThis.crypto.getRandomValues(out.subarray(offset, offset + MAX_DRAW_BYTES));
    }
    return out;
  }
}
