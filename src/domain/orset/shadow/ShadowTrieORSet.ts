import { type Dot } from "../../crdt/Dot.ts";
import type VersionVector from "../../crdt/VersionVector.ts";
import ShadowTrieORSetError from "../../errors/ShadowTrieORSetError.ts";
import ORSetElementState from "../ORSetElementState.ts";
import TrieCursor from "../trie/TrieCursor.ts";
import TrieFlusher from "../trie/TrieFlusher.ts";
import FlushResult from "../trie/FlushResult.ts";

export interface ShadowTrieORSetInit {
  readonly cursor: TrieCursor;
  readonly flusher: TrieFlusher;
}

/**
 * Async storage-backed ORSet engine built on the trie substrate.
 *
 * This is an internal engine, not the domain-facing session seam.
 * `StateSession` will own lifetime and compose one or more of these
 * engines later.
 */
export default class ShadowTrieORSet {
  readonly #cursor: TrieCursor;
  readonly #flusher: TrieFlusher;

  constructor(init: ShadowTrieORSetInit) {
    if (!(init.cursor instanceof TrieCursor)) {
      throw new ShadowTrieORSetError(
        "ShadowTrieORSet requires a TrieCursor",
        { context: { field: "cursor" } },
      );
    }
    if (!(init.flusher instanceof TrieFlusher)) {
      throw new ShadowTrieORSetError(
        "ShadowTrieORSet requires a TrieFlusher",
        { context: { field: "flusher" } },
      );
    }
    this.#cursor = init.cursor;
    this.#flusher = init.flusher;
    Object.freeze(this);
  }

  async contains(element: string): Promise<boolean> {
    return await this.#cursor.contains(element);
  }

  async getDots(element: string): Promise<ReadonlySet<string>> {
    return await this.#cursor.getDots(element);
  }

  async getElementState(element: string): Promise<ORSetElementState | null> {
    return await this.#cursor.getElementState(element);
  }

  async add(element: string, dot: Dot): Promise<void> {
    await this.#cursor.add(element, dot);
  }

  async remove(observedDots: ReadonlySet<string>): Promise<void> {
    await this.#cursor.remove(observedDots);
  }

  async compact(includedVV: VersionVector): Promise<void> {
    await this.#cursor.compact(includedVV);
  }

  async *scan(): AsyncIterable<string> {
    yield* this.#cursor.scan();
  }

  async *scanElementStates(): AsyncIterable<ORSetElementState> {
    yield* this.#cursor.scanElementStates();
  }

  async flush(): Promise<FlushResult> {
    return await this.#flusher.flush(this.#cursor.snapshot());
  }
}
