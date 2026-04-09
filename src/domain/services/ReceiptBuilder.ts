/**
 * ReceiptBuilder — computes per-op outcome results used to populate
 * TickReceipts. Each method returns an `OpOutcomeResult` subclass
 * (OpApplied / OpSuperseded / OpRedundant).
 *
 * The reducer's `applyWithReceipt` path calls these before mutation.
 * The methods are pure — they read state but do not mutate it.
 *
 * The class exposes only static methods.
 *
 * @module domain/services/ReceiptBuilder
 */

import type ORSet from '../crdt/ORSet.ts';
import type { Dot } from '../crdt/Dot.ts';
import type { LWWRegister } from '../crdt/LWW.ts';
import type { EventId } from '../utils/EventId.ts';
import { encodeDot } from '../crdt/Dot.ts';
import { compareEventIds } from '../utils/EventId.ts';
import { encodeEdgeKey, encodePropKey, encodeEdgePropKey } from './KeyCodec.js';
import { OP_TYPES } from '../types/TickReceipt.ts';
import OpOutcomeResult from '../types/ops/OpOutcomeResult.ts';
import OpApplied from '../types/ops/OpApplied.ts';
import OpSuperseded from '../types/ops/OpSuperseded.ts';
import OpRedundant from '../types/ops/OpRedundant.ts';
import DiffCalculator from './DiffCalculator.ts';

/** Set of valid receipt op types (from TickReceipt) for fast membership checks. */
const VALID_RECEIPT_OPS: ReadonlySet<string> = new Set(OP_TYPES);

/** Normalizes an arbitrary observed-dots iterable into a Set. */
function toDotSet(observedDots: Iterable<string>): Set<string> {
  return observedDots instanceof Set ? observedDots : new Set(observedDots);
}

/**
 * Walks the target dots against the ORSet's reverse index and returns
 * true iff at least one dot was both present and not yet tombstoned —
 * i.e. the remove is effective, not redundant.
 */
function hasEffectiveRemoval(orset: ORSet, targetDots: ReadonlySet<string>): boolean {
  const dotToElement = DiffCalculator.buildDotToElement(orset, targetDots);
  for (const encodedDot of targetDots) {
    if (!orset.tombstones.has(encodedDot) && dotToElement.has(encodedDot)) {
      return true;
    }
  }
  return false;
}

export default class ReceiptBuilder {
  /**
   * Valid receipt op types (the set accepted by TickReceipt). Exposed
   * for filtering forward-compatible unknown ops out of receipt
   * entries.
   */
  static readonly VALID_RECEIPT_OPS: ReadonlySet<string> = VALID_RECEIPT_OPS;

  /**
   * NodeAdd receipt outcome. Redundant iff the exact (node, dot)
   * already exists in the ORSet entries (idempotent re-delivery).
   */
  static nodeAddOutcome(
    orset: ORSet,
    op: { readonly node: string; readonly dot: Dot },
  ): OpApplied | OpRedundant {
    const encoded = encodeDot(op.dot);
    const existingDots = orset.entries.get(op.node);
    if (existingDots && existingDots.has(encoded)) {
      return new OpRedundant(op.node);
    }
    return new OpApplied(op.node);
  }

  /**
   * NodeRemove receipt outcome. Applied iff at least one observed dot
   * actually removes a live entry; otherwise redundant.
   */
  static nodeRemoveOutcome(
    orset: ORSet,
    op: { readonly node?: string; readonly observedDots: Iterable<string> },
  ): OpApplied | OpRedundant {
    const effective = hasEffectiveRemoval(orset, toDotSet(op.observedDots));
    const target = (typeof op.node === 'string' && op.node.length > 0) ? op.node : '*';
    return effective ? new OpApplied(target) : new OpRedundant(target);
  }

  /**
   * EdgeAdd receipt outcome. Redundant iff the exact (edgeKey, dot)
   * already exists.
   */
  static edgeAddOutcome(
    orset: ORSet,
    op: { readonly dot: Dot },
    edgeKey: string,
  ): OpApplied | OpRedundant {
    const encoded = encodeDot(op.dot);
    const existingDots = orset.entries.get(edgeKey);
    if (existingDots && existingDots.has(encoded)) {
      return new OpRedundant(edgeKey);
    }
    return new OpApplied(edgeKey);
  }

  /**
   * EdgeRemove receipt outcome. Target is the encoded edge key when
   * (from, to, label) are all present, otherwise `'*'` for
   * wildcard/unknown targets.
   */
  static edgeRemoveOutcome(
    orset: ORSet,
    op: {
      readonly from?: string;
      readonly to?: string;
      readonly label?: string;
      readonly observedDots: Iterable<string>;
    },
  ): OpApplied | OpRedundant {
    const effective = hasEffectiveRemoval(orset, toDotSet(op.observedDots));
    const hasEdgeFields = typeof op.from === 'string' && op.from.length > 0
      && typeof op.to === 'string' && op.to.length > 0
      && typeof op.label === 'string' && op.label.length > 0;
    const target = hasEdgeFields
      ? encodeEdgeKey(op.from as string, op.to as string, op.label as string)
      : '*';
    return effective ? new OpApplied(target) : new OpRedundant(target);
  }

  /**
   * Generic property outcome given a pre-encoded key. Uses LWW
   * semantics: applied if new, superseded if an older EventId loses,
   * redundant on exact EventId match.
   */
  static propOutcomeForKey(
    propMap: ReadonlyMap<string, LWWRegister<unknown>>,
    key: string,
    eventId: EventId,
  ): OpOutcomeResult {
    const current = propMap.get(key);
    if (!current) {
      return new OpApplied(key);
    }
    const cmp = compareEventIds(eventId, current.eventId);
    if (cmp > 0) {
      return new OpApplied(key);
    }
    if (cmp < 0) {
      return new OpSuperseded(key, current.eventId);
    }
    return new OpRedundant(key);
  }

  /** NodePropSet / legacy PropSet receipt outcome. */
  static propSetOutcome(
    propMap: ReadonlyMap<string, LWWRegister<unknown>>,
    op: { readonly node: string; readonly key: string },
    eventId: EventId,
  ): OpOutcomeResult {
    return ReceiptBuilder.propOutcomeForKey(propMap, encodePropKey(op.node, op.key), eventId);
  }

  /** EdgePropSet receipt outcome. */
  static edgePropSetOutcome(
    propMap: ReadonlyMap<string, LWWRegister<unknown>>,
    op: { readonly from: string; readonly to: string; readonly label: string; readonly key: string },
    eventId: EventId,
  ): OpOutcomeResult {
    return ReceiptBuilder.propOutcomeForKey(
      propMap,
      encodeEdgePropKey(op.from, op.to, op.label, op.key),
      eventId,
    );
  }
}
