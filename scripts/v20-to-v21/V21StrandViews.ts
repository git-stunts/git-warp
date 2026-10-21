import type V21LegacyGraph from './V21LegacyGraph.ts';
import type { V21ChainEntry, V21LegacyInventory } from './V21LegacyGraph.ts';
import type { V21LegacyStrand } from './V21LegacyStrand.ts';
import { V21TranslationBlocked } from './V21PatchTranslator.ts';
import V21StrandView, { type V21Origin, type V21ViewPatch } from './V21StrandView.ts';

/** Every lane patch of the graph, each tagged with its writer. */
export async function buildV21LaneView(legacy: V21LegacyGraph, inventory: V21LegacyInventory): Promise<V21StrandView> {
  const patches: V21ViewPatch[] = [];
  for (const [writerId, head] of inventory.laneHeads) {
    patches.push(...tag(await legacy.chain(head), { kind: 'lane', writerId }));
  }
  return new V21StrandView(patches);
}

/**
 * What a legacy strand saw: its pinned base lane patches (up to the base
 * Lamport ceiling), its braided supports at their pinned heads, and its own
 * overlay. A view that cannot be read blocks only this strand.
 */
export async function buildV21StrandView(
  legacy: V21LegacyGraph,
  strand: V21LegacyStrand,
  inventory: V21LegacyInventory,
): Promise<V21StrandView> {
  try {
    const patches: V21ViewPatch[] = [];
    const ceiling = strand.baseObservation.lamportCeiling;
    for (const [writerId, head] of Object.entries(strand.baseObservation.frontier).sort(([left], [right]) => compare(left, right))) {
      const base = (await legacy.chain(head)).filter((entry) => ceiling === null || entry.patch.lamport <= ceiling);
      patches.push(...tag(base, { kind: 'lane', writerId }));
    }
    for (const pin of strand.readOverlays) {
      if (pin.headPatchSha !== null) { patches.push(...tag(await legacy.chain(pin.headPatchSha), { kind: 'strand', name: pin.strandId })); }
    }
    const overlayHead = inventory.overlayHeads.get(strand.name);
    if (overlayHead !== undefined) { patches.push(...tag(await legacy.chain(overlayHead), { kind: 'strand', name: strand.name })); }
    return new V21StrandView(patches);
  } catch (error) {
    if (error instanceof V21TranslationBlocked) { throw error; }
    throw new V21TranslationBlocked(`the view of strand '${strand.name}' cannot be read: ${(error as Error).message}`);
  }
}

/** Supports before the strands that braid them; a cycle keeps its members last, where they block. */
export function orderV21Strands(strands: readonly V21LegacyStrand[]): V21LegacyStrand[] {
  const byName = new Map(strands.map((strand) => [strand.name, strand]));
  const ordered: V21LegacyStrand[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (strand: V21LegacyStrand): void => {
    if (done.has(strand.name) || visiting.has(strand.name)) { return; }
    visiting.add(strand.name);
    for (const pin of strand.readOverlays) {
      const support = byName.get(pin.strandId);
      if (support !== undefined) { visit(support); }
    }
    visiting.delete(strand.name);
    done.add(strand.name);
    ordered.push(strand);
  };
  for (const strand of [...strands].sort((left, right) => compare(left.name, right.name))) { visit(strand); }
  return ordered;
}

function tag(entries: readonly V21ChainEntry[], origin: V21Origin): V21ViewPatch[] {
  return entries.map((entry) => Object.freeze({ sha: entry.sha, patch: entry.patch, origin }));
}

function compare(left: string, right: string): number {
  if (left < right) { return -1; }
  return left > right ? 1 : 0;
}
