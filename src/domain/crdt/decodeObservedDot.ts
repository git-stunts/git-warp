import CrdtError from "../errors/CrdtError.ts";
import { Dot } from "./Dot.ts";

/**
 * Decodes the dot that a remove observed, or returns null when the string
 * is not a canonical dot.
 *
 * A remove checks only that each observed dot is a non-empty string, and
 * the in-memory `ORSet` stores it as a tombstone unchanged, so a state (for
 * example one that sync applied) can hold a string that `Dot.decode`
 * refuses. No add can carry such a string, so a tombstone for it cannot
 * change liveness, and the session paths skip it. A failure that is not the
 * CRDT format refusal is not expected input and is rethrown.
 */
export function decodeObservedDot(encodedDot: string): Dot | null {
  try {
    return Dot.decode(encodedDot);
  } catch (raw) {
    if (raw instanceof CrdtError) {
      return null;
    }
    throw raw;
  }
}
