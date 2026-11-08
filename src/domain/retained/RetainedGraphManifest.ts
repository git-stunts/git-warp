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
 * It binds the record-trie layout, the ordinal geometry, the record-trie root
 * and the writer frontier under one deterministic {@link ManifestCommitment}.
 * It copies no state: a live head and a retained checkpoint of the same basis
 * are the same manifest. Graph-local ordinals are derived from the dot pages
 * under its root, so an ordinal has meaning only with the manifest that
 * folds its writer chain.
 */
export default class RetainedGraphManifest {
  readonly schema: number;
  readonly layout: string;
  readonly geometry: OrdinalGeometry;
  readonly basis: ConeBasis;
  readonly commitment: ManifestCommitment;

  constructor(fields: RetainedGraphManifestFields) {
    this.schema = RETAINED_GRAPH_MANIFEST_SCHEMA;
    this.layout = requireParts(fields);
    this.geometry = requireStoredGeometry(fields.geometry);
    this.basis = fields.basis;
    this.commitment = ManifestCommitment.over(this.#commitmentFields());
    Object.freeze(this);
  }

  /** True when the manifest folds `ordinal`'s writer chain. */
  contains(ordinal: GraphOrdinal): boolean {
    return this.basis.frontier.position(ordinal.writerId) !== null;
  }

  /** Fails closed when `ordinal` has no meaning in this manifest. */
  requireOrdinal(ordinal: GraphOrdinal): void {
    if (!this.contains(ordinal)) {
      throw new RetainedGraphError('Ordinal names a writer chain this manifest does not fold', 'E_RETAINED_ORDINAL_OUT_OF_RANGE', {
        context: { ordinal: ordinal.toString(), commitment: this.commitment.toString() },
      });
    }
  }

  /** `ordinal` pinned to this manifest. */
  pin(ordinal: GraphOrdinal): ManifestOrdinal {
    this.requireOrdinal(ordinal);
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
      this.basis.root.toString(),
      `frontier ${String(entries.length)}`,
      ...entries.flatMap(([writerId, position]) => [writerId, position.sha, String(position.lamport)]),
    ];
  }
}

function requireParts(fields: RetainedGraphManifestFields): string {
  const complete = typeof fields.layout === 'string' && fields.layout.length > 0
    && fields.geometry instanceof OrdinalGeometry && fields.basis instanceof ConeBasis;
  if (!complete) {
    throw new RetainedGraphError('Retained graph manifest needs a layout, a geometry and a cone basis', 'E_RETAINED_MANIFEST_INVALID');
  }
  return fields.layout;
}
