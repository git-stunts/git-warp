import { Dot } from '../../src/domain/crdt/Dot.ts';
import NodeAdd from '../../src/domain/types/ops/NodeAdd.ts';
import type Patch from '../../src/domain/types/Patch.ts';
import type { V21Origin } from './V21StrandView.ts';

export type V21ProvenanceStatus = 'resolved' | 'unmapped' | 'ambiguous';

/**
 * How one admission's legacy `allocationDot` resolves (#1015). Keyed by the
 * commit v21 reads and the admission's operation index. The original bytes
 * are kept in the patch; this only names the identity they denoted.
 */
export type V21ProvenanceEntry = Readonly<{
  commit: string;
  operationIndex: number;
  legacyCommit: string;
  original: string;
  status: V21ProvenanceStatus;
  identity: string | null;
  candidates: readonly string[];
}>;

/** An allocation add found in legacy history: the add that minted an entity's subject. */
type AllocationSite = Readonly<{ dot: string; subject: string; origin: V21Origin; counter: number }>;

/** Indexes allocation adds across every legacy chain, then resolves admissions by origin. */
export default class V21Provenance {
  readonly #sites = new Map<string, AllocationSite[]>();

  /** Records every NodeAdd so an allocation can be traced to the chain that minted it. */
  index(origin: V21Origin, patch: Patch): void {
    for (const op of patch.ops) {
      if (!(op instanceof NodeAdd)) { continue; }
      const dot = Dot.encode(op.dot);
      const sites = this.#sites.get(dot) ?? [];
      sites.push(Object.freeze({ dot, subject: op.node, origin, counter: op.dot.counter }));
      this.#sites.set(dot, sites);
    }
  }

  /**
   * Resolves the allocated admissions in `patch`. `mintOf` names a converted
   * strand's mint id, or null when that strand was not converted.
   */
  resolve(
    patch: Patch,
    commits: Readonly<{ commit: string; legacyCommit: string }>,
    mintOf: (name: string) => string | null,
  ): V21ProvenanceEntry[] {
    const entries: V21ProvenanceEntry[] = [];
    for (const boundary of patch.entityAdmissions ?? []) {
      const { allocationDot } = boundary.origin;
      const leading = patch.ops[boundary.operationIndex];
      if (boundary.origin.kind !== 'allocated' || allocationDot === null || !(leading instanceof NodeAdd)) { continue; }
      const original = Dot.encode(allocationDot);
      const sites = (this.#sites.get(original) ?? []).filter((site) => site.subject === leading.node);
      const identities = [...new Set(sites.map((site) => identityOf(site, mintOf)))].sort();
      entries.push(Object.freeze({
        ...commits,
        operationIndex: boundary.operationIndex,
        original,
        ...outcome(identities),
        candidates: identities.filter((identity): identity is string => identity !== null),
      }));
    }
    return entries;
  }
}

function identityOf(site: AllocationSite, mintOf: (name: string) => string | null): string | null {
  if (site.origin.kind === 'lane') { return site.dot; }
  const mint = mintOf(site.origin.name);
  return mint === null ? null : `${mint}:${site.counter}`;
}

function outcome(identities: readonly (string | null)[]): Pick<V21ProvenanceEntry, 'status' | 'identity'> {
  const known = identities.filter((identity): identity is string => identity !== null);
  if (identities.length > 1) { return { status: 'ambiguous', identity: null }; }
  if (known.length === 1) { return { status: 'resolved', identity: known[0] ?? null }; }
  return { status: 'unmapped', identity: null };
}
