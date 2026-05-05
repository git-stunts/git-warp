import WarpError, { type WarpErrorOptions } from "./WarpError.ts";

/**
 * Error class for ShadowTrieORSet construction and lifecycle misuse.
 *
 * The engine mostly forwards typed cursor/flusher failures directly.
 * This class exists for the engine's own invariants, primarily
 * constructor validation.
 */
export default class ShadowTrieORSetError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, "E_SHADOW_ORSET_INPUT", options);
  }
}
