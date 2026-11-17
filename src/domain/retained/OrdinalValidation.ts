import MintId from '../crdt/MintId.ts';
import RetainedGraphError from '../errors/RetainedGraphError.ts';
import OrdinalGeometry from './OrdinalGeometry.ts';
import type { ConeDotSet } from '../services/cone/ConeRecordKey.ts';

const KINDS: ReadonlySet<string> = new Set(['node', 'edge']);

/** The OR-Set kind of an ordinal: `node` or `edge`, as the cone dot pages name it. */
export function requireOrdinalKind(kind: ConeDotSet): ConeDotSet {
  if (!KINDS.has(kind)) {
    throw new RetainedGraphError(`Unknown ordinal kind ${String(kind)}`, 'E_RETAINED_ORDINAL_INVALID', { context: { kind } });
  }
  return kind;
}

/** A writer chain name, in the one canonical mint-id spelling a cone frontier accepts. */
export function requireChain(writerId: string): string {
  MintId.decode(writerId);
  return writerId;
}

/**
 * A geometry the layout-4 record trie stores: only version 1, whose address
 * pages are the trie's 256-counter dot pages. Any other geometry needs a new
 * record layout, so it fails closed instead of reading misplaced pages.
 */
export function requireStoredGeometry(geometry: OrdinalGeometry): OrdinalGeometry {
  if (!geometry.equals(OrdinalGeometry.dotPages())) {
    throw new RetainedGraphError('The record layout does not store address pages of this geometry', 'E_RETAINED_GEOMETRY_UNSUPPORTED', {
      context: { geometry: geometry.identity() },
    });
  }
  return geometry;
}
