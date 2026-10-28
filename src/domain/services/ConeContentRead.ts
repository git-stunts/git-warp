import type ContentOwner from '../api/ContentOwner.ts';
import ConeObstructedError from '../errors/ConeObstructedError.ts';
import type ContentAttachmentRecord from '../graph/ContentAttachmentRecord.ts';
import ConeBasis from './cone/ConeBasis.ts';
import type ConeLaneBasis from './cone/ConeLaneBasis.ts';
import ConeRecordKey from './cone/ConeRecordKey.ts';
import { hydrateConeState } from './cone/ConeStateHydration.ts';
import ContentAttachmentProjection from './ContentAttachmentProjection.ts';
import { encodeEdgeKey } from './KeyCodec.ts';

/**
 * One content attachment read from a lane's cone records (#1039): the
 * owner's attachment registers and the liveness that decides whether they
 * are visible, at one advanced cone basis. A node owner costs its one
 * record; an edge owner costs the edge record and its two endpoints.
 */
export default class ConeContentRead {
  readonly basis: ConeBasis;
  readonly record: ContentAttachmentRecord | null;
  readonly records: readonly ConeRecordKey[];

  private constructor(fields: {
    readonly basis: ConeBasis;
    readonly record: ContentAttachmentRecord | null;
    readonly records: readonly ConeRecordKey[];
  }) {
    this.basis = fields.basis;
    this.record = fields.record;
    this.records = Object.freeze([...fields.records]);
    Object.freeze(this);
  }

  /** Advances the lane once and reads the owner's attachment; throws `ConeObstructedError` when obstructed. */
  static async read(cone: ConeLaneBasis, owner: ContentOwner): Promise<ConeContentRead> {
    const basis = await cone.advance();
    if (!(basis instanceof ConeBasis)) {
      throw new ConeObstructedError(cone.lane, basis);
    }
    const { descriptor } = owner;
    if (descriptor.kind === 'node') {
      const node = await cone.reader.node(basis.root, descriptor.subject);
      const record = ContentAttachmentProjection.forNode(hydrateConeState([node], []), descriptor.subject);
      return new ConeContentRead({ basis, record, records: [node.key()] });
    }
    const edgeKey = encodeEdgeKey(descriptor.from, descriptor.to, descriptor.label);
    const edge = await cone.reader.edge(basis.root, edgeKey);
    const endpoints = [await cone.reader.node(basis.root, descriptor.from), await cone.reader.node(basis.root, descriptor.to)];
    const record = ContentAttachmentProjection.forEdge(hydrateConeState(endpoints, [edge]), descriptor);
    return new ConeContentRead({
      basis, record, records: [edge.key(), ...endpoints.map((node) => ConeRecordKey.forNode(node.nodeId))],
    });
  }
}
