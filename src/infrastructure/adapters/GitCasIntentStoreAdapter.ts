import type {
  PublicationCapability,
} from '@git-stunts/git-cas';
import WarpError from '../../domain/errors/WarpError.ts';
import AssetHandle from '../../domain/storage/AssetHandle.ts';
import WarpStream from '../../domain/stream/WarpStream.ts';
import type {
  IntentNutritionLabel,
  PrecommitGuard,
  SuffixTransform,
  WarpIntentDescriptor,
} from '../../domain/types/WarpIntentDescriptor.ts';
import { buildIntentRef } from '../../domain/utils/RefLayout.ts';
import type AssetStoragePort from '../../ports/AssetStoragePort.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import IntentStorePort, {
  type IntentChannel,
  type PublishedIntent,
  type PublishIntentRequest,
} from '../../ports/IntentStorePort.ts';
import { adaptGitCasRetentionWitness } from './GitCasRetentionWitnessAdapter.ts';

const CHANNEL_TRAILER = 'eg-intent-channel';
const DESCRIPTOR_TRAILER = 'eg-intent-descriptor-handle';
const GRAPH_TRAILER = 'eg-graph';
const OWNER_TRAILER = 'eg-intent-owner';

type IntentHistory = {
  readRef(ref: string): Promise<string | null>;
  getNodeInfo(sha: string): Promise<{ message: string; parents: string[] }>;
};

type IntentCas = {
  readonly publications: Pick<PublicationCapability, 'commit'>;
};

/** git-cas-backed append-only intent descriptor journal. */
export default class GitCasIntentStoreAdapter extends IntentStorePort {
  readonly #history: IntentHistory;
  readonly #cas: IntentCas;
  readonly #assets: AssetStoragePort;
  readonly #codec: CodecPort;

  constructor(options: {
    readonly history: IntentHistory;
    readonly cas: IntentCas;
    readonly assets: AssetStoragePort;
    readonly codec: CodecPort;
  }) {
    super();
    this.#history = options.history;
    this.#cas = options.cas;
    this.#assets = options.assets;
    this.#codec = options.codec;
  }

  override async publish(request: PublishIntentRequest): Promise<PublishedIntent> {
    const ref = buildIntentRef(request.graphName, request.channel, request.ownerId);
    const expectedHead = await this.#history.readRef(ref);
    const bytes = this.#codec.encode(request.descriptor);
    const descriptorAsset = await this.#assets.stage(WarpStream.from([bytes]), {
      slug: `intent-${request.graphName}-${request.channel}-${request.ownerId}`,
      filename: 'intent.cbor',
      mime: 'application/cbor',
      expectedSize: bytes.byteLength,
    });
    const publication = await this.#cas.publications.commit({
      root: descriptorAsset.handle.toString(),
      commit: {
        message: encodeIntentMessage({
          graphName: request.graphName,
          channel: request.channel,
          ownerId: request.ownerId,
          descriptorHandle: descriptorAsset.handle.toString(),
        }),
        parents: expectedHead === null ? [] : [expectedHead],
      },
      ref: { name: ref, expected: expectedHead },
    });
    return Object.freeze({
      sha: publication.commitId,
      descriptorAsset,
      retention: adaptGitCasRetentionWitness(publication.witness.toJSON()),
    });
  }

  override scan(
    graphName: string,
    channel: IntentChannel,
    ownerId: string,
  ): WarpStream<WarpIntentDescriptor> {
    const identity = Object.freeze({ graphName, channel, ownerId });
    const handles = collectIntentHandles(
      this.#history,
      buildIntentRef(graphName, channel, ownerId),
      identity,
    );
    return WarpStream.from(streamIntentDescriptors(handles, this.#assets, this.#codec));
  }
}

type IntentJournalIdentity = Readonly<{
  graphName: string;
  channel: IntentChannel;
  ownerId: string;
}>;

async function collectIntentHandles(
  history: IntentHistory,
  ref: string,
  identity: IntentJournalIdentity,
): Promise<readonly AssetHandle[]> {
  let sha = await history.readRef(ref);
  const handles: AssetHandle[] = [];
  const seen = new Set<string>();
  while (sha !== null) {
    assertUnseenIntentPublication(seen, sha);
    const node = await history.getNodeInfo(sha);
    assertLinearIntentPublication(node.parents, sha);
    const message = decodeIntentMessage(node.message);
    assertIntentIdentity(message, identity);
    handles.push(new AssetHandle(message.descriptorHandle));
    sha = node.parents[0] ?? null;
  }
  return Object.freeze(handles);
}

function assertLinearIntentPublication(parents: readonly string[], sha: string): void {
  if (parents.length <= 1) {
    return;
  }
  throw new WarpError(
    'Intent journal publication must have at most one parent',
    'E_INTENT_JOURNAL_NON_LINEAR',
    { context: { sha, parentCount: parents.length } },
  );
}

async function* streamIntentDescriptors(
  handlesPromise: Promise<readonly AssetHandle[]>,
  assets: AssetStoragePort,
  codec: CodecPort,
): AsyncGenerator<WarpIntentDescriptor> {
  const handles = await handlesPromise;
  for (let index = handles.length - 1; index >= 0; index -= 1) {
    const handle = handles[index];
    if (handle !== undefined) {
      yield decodeIntentDescriptor(codec.decode(await collectBytes(assets.open(handle))));
    }
  }
}

function assertUnseenIntentPublication(seen: Set<string>, sha: string): void {
  if (seen.has(sha)) {
    throw new WarpError('Intent journal contains a parent cycle', 'E_INTENT_JOURNAL_CYCLE');
  }
  seen.add(sha);
}

function assertIntentIdentity(
  actual: IntentJournalIdentity & { descriptorHandle: string },
  expected: IntentJournalIdentity,
): void {
  if (actual.graphName !== expected.graphName
    || actual.channel !== expected.channel
    || actual.ownerId !== expected.ownerId) {
    throw new WarpError(
      'Intent journal publication identity mismatch',
      'E_INTENT_JOURNAL_IDENTITY',
    );
  }
}

function encodeIntentMessage(value: {
  graphName: string;
  channel: IntentChannel;
  ownerId: string;
  descriptorHandle: string;
}): string {
  return [
    'warp:intent',
    '',
    `${GRAPH_TRAILER}: ${value.graphName}`,
    `${CHANNEL_TRAILER}: ${value.channel}`,
    `${OWNER_TRAILER}: ${value.ownerId}`,
    `${DESCRIPTOR_TRAILER}: ${value.descriptorHandle}`,
  ].join('\n');
}

function decodeIntentMessage(message: string): {
  graphName: string;
  channel: IntentChannel;
  ownerId: string;
  descriptorHandle: string;
} {
  const trailers = new Map<string, string>();
  for (const line of message.split('\n')) {
    const separator = line.indexOf(': ');
    if (separator > 0) {
      trailers.set(line.slice(0, separator), line.slice(separator + 2));
    }
  }
  const channel = requireTrailer(trailers, CHANNEL_TRAILER);
  if (channel !== 'admitted' && channel !== 'queued') {
    throw new WarpError('Intent journal channel is invalid', 'E_INTENT_JOURNAL_MESSAGE');
  }
  return {
    graphName: requireTrailer(trailers, GRAPH_TRAILER),
    channel,
    ownerId: requireTrailer(trailers, OWNER_TRAILER),
    descriptorHandle: requireTrailer(trailers, DESCRIPTOR_TRAILER),
  };
}

function decodeIntentDescriptor(value: unknown): WarpIntentDescriptor {
  const candidate = requireDescriptorRecord(value);
  return Object.freeze({
    intentId: requireDescriptorString(candidate, 'intentId'),
    nutritionLabel: decodeNutritionLabel(candidate['nutritionLabel']),
    precommitGuards: decodePrecommitGuards(candidate['precommitGuards']),
    suffixTransform: decodeSuffixTransform(candidate['suffixTransform']),
  });
}

function decodeNutritionLabel(value: unknown): IntentNutritionLabel {
  const label = requireDescriptorRecord(value);
  return Object.freeze({
    bundleHash: requireDescriptorString(label, 'bundleHash'),
    coreHash: requireDescriptorString(label, 'coreHash'),
    profile: requireDescriptorString(label, 'profile'),
    budget: requireDescriptorString(label, 'budget'),
  });
}

function decodePrecommitGuards(value: unknown): readonly PrecommitGuard[] {
  if (!isUnknownArray(value)) {
    throw invalidDescriptor();
  }
  return Object.freeze(value.map((guard) => decodePrecommitGuard(guard)));
}

function decodePrecommitGuard(value: unknown): PrecommitGuard {
  const guard = requireDescriptorRecord(value);
  const expected = optionalDescriptorString(guard, 'expected');
  const agentId = optionalDescriptorString(guard, 'agentId');
  return Object.freeze({
    op: requireGuardOperation(guard['op']),
    nodeId: requireDescriptorString(guard, 'nodeId'),
    failureTag: requireDescriptorString(guard, 'failureTag'),
    ...(expected === undefined ? {} : { expected }),
    ...(agentId === undefined ? {} : { agentId }),
  });
}

function decodeSuffixTransform(value: unknown): SuffixTransform {
  const transform = requireDescriptorRecord(value);
  return Object.freeze({
    op: requireDescriptorString(transform, 'op'),
    payload: Object.freeze({ ...requireDescriptorRecord(transform['payload']) }),
  });
}

function requireGuardOperation(value: unknown): PrecommitGuard['op'] {
  if (value !== 'nodeStatus' && value !== 'nodeUnassignedOrSelf' && value !== 'edgeExists') {
    throw invalidDescriptor();
  }
  return value;
}

function optionalDescriptorString(
  record: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = record[key];
  return value === undefined ? undefined : requireDescriptorString(record, key);
}

function requireDescriptorString(
  record: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw invalidDescriptor();
  }
  return value;
}

function requireDescriptorRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (!isDescriptorRecord(value)) {
    throw invalidDescriptor();
  }
  return value;
}

function isDescriptorRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function invalidDescriptor(): WarpError {
  return new WarpError('Intent descriptor asset is invalid', 'E_INTENT_DESCRIPTOR_ASSET');
}

function requireTrailer(trailers: ReadonlyMap<string, string>, key: string): string {
  const value = trailers.get(key);
  if (value === undefined || value.length === 0) {
    throw new WarpError(`Intent journal publication is missing ${key}`, 'E_INTENT_JOURNAL_MESSAGE');
  }
  return value;
}

async function collectBytes(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of source) {
    chunks.push(chunk);
    size += chunk.byteLength;
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
