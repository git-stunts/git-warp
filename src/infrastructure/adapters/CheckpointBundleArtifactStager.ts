import VersionVector from '../../domain/crdt/VersionVector.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import type { CheckpointStateEnvelopeBuffers } from '../../domain/services/state/CheckpointSerializer.ts';
import WarpStream from '../../domain/stream/WarpStream.ts';
import type AssetStoragePort from '../../ports/AssetStoragePort.ts';
import type { CheckpointRecord } from '../../ports/CheckpointStorePort.ts';
import type CodecPort from '../../ports/CodecPort.ts';

/** Stages deterministic checkpoint members without retaining artifact bytes in the adapter. */
export async function* stageCheckpointBundleArtifacts(options: {
  readonly assets: AssetStoragePort;
  readonly codec: CodecPort;
  readonly envelope: CheckpointStateEnvelopeBuffers;
  readonly record: CheckpointRecord;
}): AsyncGenerator<[string, string]> {
  for (const [path, bytes] of checkpointArtifacts(options)) {
    const staged = await options.assets.stage(WarpStream.from([bytes]), {
      slug: checkpointArtifactSlug(options.record.graphName, path),
      filename: path,
      expectedSize: bytes.byteLength,
    });
    yield [path, staged.handle.toString()];
  }
}

function checkpointArtifacts(options: {
  readonly codec: CodecPort;
  readonly envelope: CheckpointStateEnvelopeBuffers;
  readonly record: CheckpointRecord;
}): readonly [string, Uint8Array][] {
  const { codec, envelope, record } = options;
  const artifacts: Array<[string, Uint8Array]> = [
    ['appliedVV.cbor', codec.encode(VersionVector.serialize(record.appliedVV))],
    ['frontier.cbor', encodeFrontier(record.frontier, codec)],
    ['state/edgeAlive', envelope.edgeAlive],
    ['state/edgeBirthEvent.cbor', envelope.edgeBirthEvent],
    ['state/nodeAlive', envelope.nodeAlive],
    ['state/observedFrontier.cbor', envelope.observedFrontier],
    ['state/prop.cbor', envelope.prop],
  ];
  appendProvenanceArtifact(artifacts, record, codec);
  appendIndexArtifacts(artifacts, record);
  return Object.freeze(artifacts.sort(([left], [right]) => left.localeCompare(right)));
}

function appendProvenanceArtifact(
  artifacts: Array<[string, Uint8Array]>,
  record: CheckpointRecord,
  codec: CodecPort,
): void {
  if (record.provenanceIndex !== null && record.provenanceIndex !== undefined) {
    artifacts.push(['provenanceIndex.cbor', record.provenanceIndex.serialize({ codec })]);
  }
}

function appendIndexArtifacts(
  artifacts: Array<[string, Uint8Array]>,
  record: CheckpointRecord,
): void {
  const { indexShards } = record;
  if (indexShards === null || indexShards === undefined) {
    return;
  }
  for (const path of Object.keys(indexShards).sort()) {
    const bytes = indexShards[path];
    if (bytes === undefined) {
      throw new WarpError(
        `Missing index shard for path: ${path}`,
        'E_CHECKPOINT_MISSING_INDEX_SHARD',
      );
    }
    artifacts.push([`index/${path}`, bytes]);
  }
}

function encodeFrontier(frontier: Map<string, string>, codec: CodecPort): Uint8Array {
  const entries = [...frontier.entries()].sort(([left], [right]) => left.localeCompare(right));
  return codec.encode(Object.fromEntries(entries));
}

function checkpointArtifactSlug(graphName: string, path: string): string {
  return `checkpoint-${graphName}-${path}`.replace(/[^A-Za-z0-9._-]/gu, '-');
}
