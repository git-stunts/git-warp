import { expect } from 'vitest';
import PatchEntry from '../../src/domain/artifacts/PatchEntry.ts';
import ConeWriterDivergedObstruction from '../../src/domain/services/cone/ConeWriterDivergedObstruction.ts';
import ConeWriterPatches from '../../src/domain/services/cone/ConeWriterPatches.ts';
import type { PatchOp } from '../../src/domain/types/ops/unions.ts';
import Patch from '../../src/domain/types/Patch.ts';
import ConePatchFeedPort from '../../src/ports/ConePatchFeedPort.ts';

/** Writer chains held in memory for cone tests; ranges are served from the chain after `fromSha`. */
export default class MemoryConeFeed extends ConePatchFeedPort {
  readonly chains = new Map<string, PatchEntry[]>();
  readonly ranges: Array<{ writerId: string; fromSha: string | null; toSha: string }> = [];
  diverged = new Set<string>();
  readonly #lane: string;
  #shas = 0;

  constructor(lane: string) {
    super();
    this.#lane = lane;
  }

  append(writer: string, ops: PatchOp[]): PatchEntry {
    const chain = this.chains.get(writer) ?? [];
    this.#shas += 1;
    const sha = `${writer.charCodeAt(1).toString(16)}${this.#shas.toString(16).padStart(38, '0')}`;
    const patchEntry = new PatchEntry({ patch: new Patch({ writer, lamport: chain.length + 1, context: {}, ops }), sha });
    chain.push(patchEntry);
    this.chains.set(writer, chain);
    return patchEntry;
  }

  override async writerTips(lane: string): Promise<ReadonlyMap<string, string>> {
    expect(lane).toBe(this.#lane);
    return new Map([...this.chains].map(([writer, chain]) => [writer, chain[chain.length - 1]?.sha ?? '']));
  }

  override async patchesAfter(
    _lane: string,
    writerId: string,
    range: { readonly fromSha: string | null; readonly toSha: string },
  ): Promise<ConeWriterPatches | ConeWriterDivergedObstruction> {
    this.ranges.push({ writerId, ...range });
    if (this.diverged.has(writerId)) {
      return new ConeWriterDivergedObstruction({ writerId, foldedSha: range.fromSha, tipSha: range.toSha });
    }
    const chain = this.chains.get(writerId) ?? [];
    const start = range.fromSha === null ? 0 : chain.findIndex((patchEntry) => patchEntry.sha === range.fromSha) + 1;
    return new ConeWriterPatches(writerId, chain.slice(start));
  }
}
