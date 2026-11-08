import RetainedGraphError from '../errors/RetainedGraphError.ts';
import ConeBasis from '../services/cone/ConeBasis.ts';
import type GraphOrdinal from './GraphOrdinal.ts';
import ManifestCommitment from './ManifestCommitment.ts';
import ManifestOrdinal from './ManifestOrdinal.ts';
import OrdinalGeometry from './OrdinalGeometry.ts';
import { requireStoredGeometry } from './OrdinalValidation.ts';

/** The manifest schema this version commits to and reads. */
export const RETAINED_GRAPH_MANIFEST_SCHEMA = 1;
const MANIFEST_DOMAIN = 'git-warp retained graph manifest';

/** Constructor fields of a retained graph manifest. */
export type RetainedGraphManifestFields = {
  /** The record-trie layout marker of the store the basis lives in. */
  readonly layout: string;
  readonly geometry: OrdinalGeometry;
  readonly basis: ConeBasis;
};

/**
 * The immutable retained graph manifest (#815): the cone basis bundle seen as
 * the one retained representation of a graph at a frontier.
 *
 * Its {@link ManifestCommitment} binds the schema, the record-trie layout, the
 * ordinal geometry and the writer frontier. In a CRDT the frontier fixes the
 * logical state, and ordinals derive only from writer chains, so a live clone
 * and a rebuild at the same frontier share one commitment. The record-trie
 * root is not committed: it is a physical artifact of fold order (adjacency
 * pages keep arrival order until #1044 slice 1). The manifest still carries
 * the root, because resolution reads records under it.
 *
 * It copies no state: a live head and a retained checkpoint of the same basis
 * are the same manifest. An ordinal is stable across every manifest; a
 * {@link ManifestOrdinal} pin is bound to one commitment.
 */
export default class RetainedGraphManifest {
  readonly schema: number;
  readonly layout: string;
  readonly geometry: OrdinalGeometry;
  readonly basis: ConeBasis;
  readonly commitment: ManifestCommitment;

  constructor(fields: RetainedGraphManifestFields) {
    requireParts(fields);
    this.schema = RETAINED_GRAPH_MANIFEST_SCHEMA;
    this.layout = fields.layout;
    this.geometry = requireStoredGeometry(fields.geometry);
    this.basis = fields.basis;
    this.commitment = ManifestCommitment.over(this.#commitmentFields());
    Object.freeze(this);
  }

  /** True when the manifest folds `writerId`'s chain. */
  foldsWriter(writerId: string): boolean {
    return this.basis.frontier.position(writerId) !== null;
  }

  /**
   * Fails closed when the manifest does not fold `ordinal`'s writer chain.
   *
   * This checks writer membership only. The frontier carries each writer's
   * patch sha and Lamport clock, not a dot-counter high-water, so a counter
   * past the folded prefix passes here; resolving it reads its one address
   * page and fails with `E_RETAINED_ADDRESS_MISSING`.
   */
  requireFoldedWriter(ordinal: GraphOrdinal): void {
    if (!this.foldsWriter(ordinal.writerId)) {
      throw new RetainedGraphError('Ordinal names a writer chain this manifest does not fold', 'E_RETAINED_WRITER_NOT_FOLDED', {
        context: { ordinal: ordinal.toString(), commitment: this.commitment.toString() },
      });
    }
  }

  /** `ordinal` pinned to this manifest's commitment; its writer must be folded. */
  pin(ordinal: GraphOrdinal): ManifestOrdinal {
    this.requireFoldedWriter(ordinal);
    return new ManifestOrdinal(this.commitment, ordinal);
  }

  equals(other: RetainedGraphManifest): boolean {
    return other.commitment.equals(this.commitment);
  }

  #commitmentFields(): string[] {
    const entries = this.basis.frontier.entries();
    return [
      MANIFEST_DOMAIN,
      `schema ${String(this.schema)}`,
      this.layout,
      this.geometry.identity(),
      `frontier ${String(entries.length)}`,
      ...entries.flatMap(([writerId, position]) => [writerId, position.sha, String(position.lamport)]),
    ];
  }
}

/** Refuses a manifest without a layout marker, a geometry or a cone basis. */
function requireParts(fields: RetainedGraphManifestFields): void {
  const complete = typeof fields.layout === 'string' && fields.layout.length > 0
    && fields.geometry instanceof OrdinalGeometry && fields.basis instanceof ConeBasis;
  if (!complete) {
    throw new RetainedGraphError('Retained graph manifest needs a layout, a geometry and a cone basis', 'E_RETAINED_MANIFEST_INVALID');
  }
}
