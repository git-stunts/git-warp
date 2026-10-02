import type PatchJournalPort from '../../ports/PatchJournalPort.ts';
import type ContentOwner from '../api/ContentOwner.ts';
import type ContentAttachmentRecord from '../graph/ContentAttachmentRecord.ts';
import type { PatchOp } from '../types/ops/unions.ts';
import type PatchEntry from '../artifacts/PatchEntry.ts';
import NodeAdd from '../types/ops/NodeAdd.ts';
import NodeRemove from '../types/ops/NodeRemove.ts';
import EdgeAdd from '../types/ops/EdgeAdd.ts';
import EdgeRemove from '../types/ops/EdgeRemove.ts';
import PropSet from '../types/ops/PropSet.ts';
import NodePropSet from '../types/ops/NodePropSet.ts';
import EdgePropSet from '../types/ops/EdgePropSet.ts';
import { EventId } from '../utils/EventId.ts';
import WarpError from '../errors/WarpError.ts';
import { type default as ContentReadBasis, contentReadLimit } from './ContentReadBasis.ts';
import ContentAttachmentProjection from './ContentAttachmentProjection.ts';
import WarpState from './state/WarpState.ts';
import { applyPatchOp } from './JoinReducer.ts';
import { encodeLegacyEdgePropNode, CONTENT_PROPERTY_KEY, CONTENT_SIZE_PROPERTY_KEY, CONTENT_MIME_PROPERTY_KEY } from './KeyCodec.ts';

export const MAX_CONTENT_READ_PATCHES = 10_000;
export const MAX_CONTENT_READ_OPERATIONS = 50_000;
export const MAX_CONTENT_READ_TEXT_UNITS = 8 * 1024 * 1024;
export const MAX_CONTENT_READ_MEMBERS = 50_000;
const CONTENT_KEYS = new Set([CONTENT_PROPERTY_KEY, CONTENT_SIZE_PROPERTY_KEY, CONTENT_MIME_PROPERTY_KEY]);

/** Replays only one owner's membership and content registers, preserving original event identities. */
export default class ContentReadProjection {
  readonly #owner: ContentOwner;
  readonly #state = WarpState.empty();
  #patches = 0;
  #operations = 0;
  #text = 0;
  #members = 0;

  constructor(owner: ContentOwner) { this.#owner = owner; }

  async read(journal: PatchJournalPort, basis: ContentReadBasis): Promise<ContentAttachmentRecord | null> {
    for (const [writer, head] of basis.entries) {
      await this.#scan(journal, { writer, head });
    }
    const owner = this.#owner.descriptor;
    return owner.kind === 'node'
      ? ContentAttachmentProjection.forNode(this.#state, owner.subject)
      : ContentAttachmentProjection.forEdge(this.#state, owner);
  }

  async #scan(journal: PatchJournalPort, source: { writer: string; head: string }): Promise<void> {
    let first = true;
    for await (const entry of journal.scanPatchHistory(source.writer, source.head)) {
      if (!matchesCapturedHistory(entry, source, first)) {
        throw new WarpError('Content history does not match captured heads', 'E_CONTENT_READ_HISTORY');
      }
      first = false;
      this.#apply(entry);
    }
    if (first) { throw new WarpError('Captured content history is missing', 'E_CONTENT_READ_HISTORY'); }
  }

  #apply(entry: PatchEntry): void {
    this.#patches++;
    this.#operations += entry.patch.ops.length;
    if (this.#patches > MAX_CONTENT_READ_PATCHES || this.#operations > MAX_CONTENT_READ_OPERATIONS) {
      throw contentReadLimit();
    }
    this.#charge(entry.sha, entry.patch.writer);
    entry.patch.ops.forEach((op, index) => {
      if (!this.#relevant(op)) { return; }
      this.#chargeOperation(op);
      applyPatchOp(this.#state, op, new EventId(entry.patch.lamport, entry.patch.writer, entry.sha, index));
    });
  }

  #relevant(op: PatchOp): boolean {
    if (op instanceof NodeAdd || op instanceof NodeRemove) { return this.#node(op.node); }
    if (op instanceof EdgeAdd || op instanceof EdgeRemove) { return this.#edge(op); }
    return this.#property(op);
  }

  #property(op: PatchOp): boolean {
    if (op instanceof EdgePropSet) { return this.#edge(op) && CONTENT_KEYS.has(op.key); }
    if (op instanceof PropSet || op instanceof NodePropSet) {
      return this.#matchesProperty(op.node, op.key);
    }
    return false;
  }

  #matchesProperty(node: string, key: string): boolean {
    return node === this.#propertyOwner() && CONTENT_KEYS.has(key);
  }

  #node(node: string): boolean {
    const owner = this.#owner.descriptor;
    return owner.kind === 'node' ? node === owner.subject : node === owner.from || node === owner.to;
  }

  #edge(edge: { from: string; to: string; label: string }): boolean {
    const owner = this.#owner.descriptor;
    return owner.kind === 'edge' && edge.from === owner.from && edge.to === owner.to && edge.label === owner.label;
  }

  #propertyOwner(): string {
    const owner = this.#owner.descriptor;
    return owner.kind === 'node' ? owner.subject : encodeLegacyEdgePropNode(owner.from, owner.to, owner.label);
  }

  #chargeOperation(op: PatchOp): void {
    if (op instanceof NodeRemove || op instanceof EdgeRemove) {
      for (const dot of op.observedDots) { this.#charge(dot); }
    } else { this.#chargeAddition(op); }
  }

  #chargeAddition(op: PatchOp): void {
    if (op instanceof NodeAdd || op instanceof EdgeAdd) {
      this.#charge(op.dot.writerId);
    } else { this.#chargeProperty(op); }
  }

  #chargeProperty(op: PatchOp): void {
    if (op instanceof PropSet || op instanceof NodePropSet || op instanceof EdgePropSet) {
      if (typeof op.value === 'string') { this.#charge(op.value); }
    }
  }

  #charge(...values: readonly string[]): void {
    for (const value of values) { this.#text += value.length; this.#members++; }
    if (this.#text > MAX_CONTENT_READ_TEXT_UNITS || this.#members > MAX_CONTENT_READ_MEMBERS) {
      throw contentReadLimit();
    }
  }
}

function matchesCapturedHistory(entry: PatchEntry, source: { writer: string; head: string }, first: boolean): boolean {
  return entry.patch.writer === source.writer && (!first || entry.sha === source.head);
}
