import { Dot } from '../../src/domain/crdt/Dot.ts';
import VersionVector from '../../src/domain/crdt/VersionVector.ts';
import EdgeAdd from '../../src/domain/types/ops/EdgeAdd.ts';
import NodeAdd from '../../src/domain/types/ops/NodeAdd.ts';
import type Patch from '../../src/domain/types/Patch.ts';

/** Where a legacy patch came from: a lane writer chain or a strand overlay. */
export type V21Origin =
  | Readonly<{ kind: 'lane'; writerId: string }>
  | Readonly<{ kind: 'strand'; name: string }>;

export type V21ViewPatch = Readonly<{ sha: string; patch: Patch; origin: V21Origin }>;

/** One add operation visible in a view, under its legacy dot. */
export type V21AddSite = Readonly<{
  dot: string;
  key: string;
  counter: number;
  origin: V21Origin;
  sha: string;
  target: string;
}>;

/**
 * Every add visible to one strand (base lane patches, braided support
 * overlays, its own overlay), indexed by legacy dot. Legacy tombstones are
 * keyed only by dot, so a legacy remove denoted every add site its observed
 * dot names here (#1015).
 */
export default class V21StrandView {
  readonly patches: readonly V21ViewPatch[];
  readonly #sites = new Map<string, V21AddSite[]>();
  readonly #maxima = new Map<string, number>();
  readonly #laneWriters = new Set<string>();
  readonly #strandNames = new Set<string>();

  constructor(patches: readonly V21ViewPatch[]) {
    this.patches = patches;
    for (const entry of patches) { this.#index(entry); }
  }

  sites(dot: string): readonly V21AddSite[] {
    return this.#sites.get(dot) ?? [];
  }

  /** Every legacy dot that more than one add site in the view carries. */
  duplicateDots(): ReadonlyMap<string, readonly V21AddSite[]> {
    return new Map([...this.#sites].filter(([, sites]) => sites.length > 1));
  }

  hasLaneWriter(writerId: string): boolean {
    return this.#laneWriters.has(writerId);
  }

  hasStrand(name: string): boolean {
    return this.#strandNames.has(name);
  }

  /** Highest counter `origin` used under legacy `key` in this view. */
  maxCounter(origin: V21Origin, key: string): number {
    return this.#maxima.get(originKey(origin, key)) ?? 0;
  }

  #index(entry: V21ViewPatch): void {
    const { origin, patch } = entry;
    if (origin.kind === 'lane') {
      this.#laneWriters.add(origin.writerId);
      const own = VersionVector.from(patch.context).get(origin.writerId) ?? 0;
      this.#raise(originKey(origin, origin.writerId), own);
    } else {
      this.#strandNames.add(origin.name);
    }
    for (const op of patch.ops) {
      if (op instanceof NodeAdd) { this.#addSite(entry, op.dot, op.node); }
      if (op instanceof EdgeAdd) { this.#addSite(entry, op.dot, `${op.from}\0${op.to}\0${op.label}`); }
    }
  }

  #addSite(entry: V21ViewPatch, dot: Dot, target: string): void {
    const encoded = Dot.encode(dot);
    const site: V21AddSite = Object.freeze({
      dot: encoded, key: dot.writerId, counter: dot.counter, origin: entry.origin, sha: entry.sha, target,
    });
    const sites = this.#sites.get(encoded) ?? [];
    if (!sites.some((existing) => existing.sha === site.sha && existing.target === target)) { sites.push(site); }
    this.#sites.set(encoded, sites);
    this.#raise(originKey(entry.origin, dot.writerId), dot.counter);
  }

  #raise(key: string, counter: number): void {
    this.#maxima.set(key, Math.max(this.#maxima.get(key) ?? 0, counter));
  }
}

function originKey(origin: V21Origin, key: string): string {
  return origin.kind === 'lane' ? `lane\0${origin.writerId}\0${key}` : `strand\0${origin.name}\0${key}`;
}
