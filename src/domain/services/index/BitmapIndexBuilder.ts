import { canonicalStringify } from '../../utils/canonicalStringify.ts';
import { textEncode } from '../../utils/bytes.ts';
import { requireCodec } from '../codec/CodecRequirement.ts';
import BitmapAccumulator from './BitmapAccumulator.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type { RoaringBitmapSubset } from '../../utils/roaring.ts';

/**
 * Serializes a frontier Map into CBOR and JSON blobs in the given tree.
 */
function serializeFrontierToTree(
  frontier: Map<string, string>,
  tree: Record<string, Uint8Array>,
  codec: CodecPort,
): void {
  const sorted: Record<string, string | undefined> = {};
  for (const key of Array.from(frontier.keys()).sort()) {
    sorted[key] = frontier.get(key);
  }
  const envelope = { version: 1, writerCount: frontier.size, frontier: sorted };
  tree['frontier.cbor'] = codec.encode(envelope);
  tree['frontier.json'] = textEncode(canonicalStringify(envelope));
}

/**
 * Builder for constructing bitmap indexes in memory.
 *
 * Pure domain class with no infrastructure dependencies. Delegates ID
 * allocation and bitmap accumulation to BitmapAccumulator. Serializes
 * to CBOR shard format (no envelopes — git-cas handles integrity).
 *
 * @example
 * const builder = new BitmapIndexBuilder();
 * builder.addEdge(parentSha, childSha);
 * const tree = await builder.serialize();
 */
export default class BitmapIndexBuilder {
  private readonly _codec: CodecPort | null;
  private readonly _accumulator: BitmapAccumulator;

  /**
   * Creates a new BitmapIndexBuilder instance.
   */
  constructor(options?: { codec?: CodecPort }) {
    const { codec } = options ?? {};
    this._codec = codec ?? null;
    this._accumulator = new BitmapAccumulator();
  }

  /** SHA→numeric-ID forward mapping. */
  get shaToId(): Map<string, number> {
    return this._accumulator.shaToId;
  }

  /** Numeric-ID→SHA reverse mapping. */
  get idToSha(): string[] {
    return this._accumulator.idToSha;
  }

  /** Active bitmap map keyed by `{dir}_{sha}`. */
  get bitmaps(): Map<string, RoaringBitmapSubset> {
    return this._accumulator.bitmaps;
  }

  /**
   * Registers a node without adding edges.
   * @returns The assigned numeric ID
   */
  registerNode(sha: string): number {
    return this._accumulator.registerNode(sha);
  }

  /**
   * Adds a directed edge from source to target node.
   */
  addEdge(srcSha: string, tgtSha: string): void {
    this._accumulator.addEdge(srcSha, tgtSha);
  }

  /**
   * Serializes the index to a tree structure of CBOR buffers.
   *
   * Output structure (sharded by SHA prefix):
   * - `meta_XX.cbor`: {sha: id, ...} for SHAs with prefix XX
   * - `shards_fwd_XX.cbor`: {sha: Uint8Array(bitmap), ...} for forward edges
   * - `shards_rev_XX.cbor`: {sha: Uint8Array(bitmap), ...} for reverse edges
   */
  serialize(options?: { frontier?: Map<string, string> }): Record<string, Uint8Array> {
    const { frontier } = options ?? {};
    const codec = requireCodec(this._codec, 'BitmapIndexBuilder.serialize');
    const tree: Record<string, Uint8Array> = {};

    const metaShards = this._accumulator.buildMetaShards();
    for (const [prefix, map] of Object.entries(metaShards)) {
      tree[`meta_${prefix}.cbor`] = codec.encode(map);
    }

    const bitmapShards = this._accumulator.serializeBitmapsToShards();
    for (const dir of ['fwd', 'rev'] as const) {
      for (const [prefix, data] of Object.entries(bitmapShards[dir])) {
        tree[`shards_${dir}_${prefix}.cbor`] = codec.encode(data);
      }
    }

    if (frontier !== undefined) {
      serializeFrontierToTree(frontier, tree, codec);
    }

    return tree;
  }
}
