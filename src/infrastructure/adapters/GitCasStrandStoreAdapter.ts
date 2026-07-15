import type {
  BundleCapability,
  PublicationCapability,
} from '@git-stunts/git-cas';
import StrandError from '../../domain/errors/StrandError.ts';
import AssetHandle from '../../domain/storage/AssetHandle.ts';
import BundleHandle from '../../domain/storage/BundleHandle.ts';
import WarpStream from '../../domain/stream/WarpStream.ts';
import { buildStrandRef, buildStrandsPrefix } from '../../domain/utils/RefLayout.ts';
import type AssetStoragePort from '../../ports/AssetStoragePort.ts';
import StrandStorePort, {
  type PublishedStrandDescriptor,
  type PublishStrandDescriptorRequest,
} from '../../ports/StrandStorePort.ts';
import { adaptGitCasRetentionWitness } from './GitCasRetentionWitnessAdapter.ts';

const DESCRIPTOR_HANDLE_TRAILER = 'eg-strand-descriptor-handle';
const GRAPH_TRAILER = 'eg-graph';
const STRAND_TRAILER = 'eg-strand';

type StrandHistory = {
  readRef(ref: string): Promise<string | null>;
  listRefs(prefix: string): Promise<string[]>;
  deleteRef(ref: string): Promise<void>;
  readObjectType(oid: string): Promise<string>;
  getNodeInfo(sha: string): Promise<{ message: string }>;
  readBlob(oid: string): Promise<Uint8Array>;
};

type StrandCas = {
  readonly bundles: Pick<BundleCapability, 'putOrdered'>;
  readonly publications: Pick<PublicationCapability, 'commit'>;
};

/** Retains strand descriptors and queued assets as one causal bundle. */
export default class GitCasStrandStoreAdapter extends StrandStorePort {
  readonly #history: StrandHistory;
  readonly #cas: StrandCas;
  readonly #assets: AssetStoragePort;

  constructor(options: {
    readonly history: StrandHistory;
    readonly cas: StrandCas;
    readonly assets: AssetStoragePort;
  }) {
    super();
    this.#history = options.history;
    this.#cas = options.cas;
    this.#assets = options.assets;
  }

  override async readDescriptor(graphName: string, strandId: string): Promise<Uint8Array | null> {
    const revision = await this.#history.readRef(buildStrandRef(graphName, strandId));
    if (revision === null) {
      return null;
    }
    const objectType = await this.#history.readObjectType(revision);
    if (objectType === 'blob') {
      return await this.#history.readBlob(revision);
    }
    if (objectType !== 'commit') {
      throw new StrandError('strand descriptor ref must target a blob or publication commit', {
        code: 'E_STRAND_CORRUPT',
        context: { graphName, strandId, revision, objectType },
      });
    }
    const node = await this.#history.getNodeInfo(revision);
    const trailers = decodeDescriptorMessage(node.message);
    requireDescriptorIdentity(trailers, { graphName, strandId, revision });
    return await collectBytes(
      this.#assets.open(new AssetHandle(trailers.descriptorHandle)),
    );
  }

  override async publishDescriptor(
    request: PublishStrandDescriptorRequest,
  ): Promise<PublishedStrandDescriptor> {
    const ref = buildStrandRef(request.graphName, request.strandId);
    const expectedHead = await this.#history.readRef(ref);
    const parent = await retainedDescriptorParent(this.#history, expectedHead);
    const descriptorAsset = await stageDescriptor(this.#assets, request);
    const bundle = await this.#cas.bundles.putOrdered({
      members: descriptorBundleMembers(descriptorAsset.handle, request.attachments),
    });
    const publication = await this.#cas.publications.commit({
      root: bundle.handle,
      commit: {
        message: encodeDescriptorMessage({
          graphName: request.graphName,
          strandId: request.strandId,
          descriptorHandle: descriptorAsset.handle.toString(),
        }),
        parents: parent === null ? [] : [parent],
      },
      ref: { name: ref, expected: expectedHead },
    });
    return Object.freeze({
      revision: publication.commitId,
      descriptorAsset,
      bundleHandle: new BundleHandle(publication.root.toString()),
      retention: adaptGitCasRetentionWitness(publication.witness.toJSON()),
    });
  }

  override async listStrandIds(graphName: string): Promise<string[]> {
    const prefix = buildStrandsPrefix(graphName);
    const refs = await this.#history.listRefs(prefix);
    return refs
      .filter((ref) => ref.startsWith(prefix))
      .map((ref) => ref.slice(prefix.length))
      .filter((strandId) => strandId.length > 0 && !strandId.includes('/'))
      .sort();
  }

  override async hasDescriptor(graphName: string, strandId: string): Promise<boolean> {
    return await this.#history.readRef(buildStrandRef(graphName, strandId)) !== null;
  }

  override async deleteDescriptor(graphName: string, strandId: string): Promise<boolean> {
    const ref = buildStrandRef(graphName, strandId);
    if (await this.#history.readRef(ref) === null) {
      return false;
    }
    await this.#history.deleteRef(ref);
    return true;
  }
}

async function retainedDescriptorParent(
  history: StrandHistory,
  expectedHead: string | null,
): Promise<string | null> {
  if (expectedHead === null) {
    return null;
  }
  return await history.readObjectType(expectedHead) === 'commit' ? expectedHead : null;
}

async function stageDescriptor(
  assets: AssetStoragePort,
  request: PublishStrandDescriptorRequest,
) {
  return await assets.stage(WarpStream.from([request.descriptor]), {
    slug: `strand-${request.graphName}-${request.strandId}`,
    filename: 'descriptor.json',
    mime: 'application/json',
    expectedSize: request.descriptor.byteLength,
  });
}

function descriptorBundleMembers(
  descriptor: AssetHandle,
  attachments: readonly AssetHandle[],
): WarpStream<[string, string]> {
  const members: Array<[string, string]> = [['descriptor', descriptor.toString()]];
  const unique = [...new Set(attachments.map((handle) => handle.toString()))].sort();
  for (let index = 0; index < unique.length; index++) {
    const handle = unique[index];
    if (handle !== undefined) {
      members.push([`attachments/${String(index).padStart(8, '0')}`, handle]);
    }
  }
  return WarpStream.from(members);
}

function encodeDescriptorMessage(value: {
  graphName: string;
  strandId: string;
  descriptorHandle: string;
}): string {
  return [
    'warp:strand-descriptor',
    '',
    `${GRAPH_TRAILER}: ${value.graphName}`,
    `${STRAND_TRAILER}: ${value.strandId}`,
    `${DESCRIPTOR_HANDLE_TRAILER}: ${value.descriptorHandle}`,
  ].join('\n');
}

function decodeDescriptorMessage(message: string): {
  graphName: string;
  strandId: string;
  descriptorHandle: string;
} {
  const trailers = new Map<string, string>();
  for (const line of message.split('\n')) {
    const separator = line.indexOf(': ');
    if (separator > 0) {
      trailers.set(line.slice(0, separator), line.slice(separator + 2));
    }
  }
  return {
    graphName: requireTrailer(trailers, GRAPH_TRAILER),
    strandId: requireTrailer(trailers, STRAND_TRAILER),
    descriptorHandle: requireTrailer(trailers, DESCRIPTOR_HANDLE_TRAILER),
  };
}

function requireTrailer(trailers: ReadonlyMap<string, string>, key: string): string {
  const value = trailers.get(key);
  if (value === undefined || value.length === 0) {
    throw new StrandError(`strand descriptor publication is missing ${key}`, {
      code: 'E_STRAND_CORRUPT',
    });
  }
  return value;
}

function requireDescriptorIdentity(
  trailers: { readonly graphName: string; readonly strandId: string },
  expected: { readonly graphName: string; readonly strandId: string; readonly revision: string },
): void {
  if (trailers.graphName === expected.graphName && trailers.strandId === expected.strandId) {
    return;
  }
  throw new StrandError('strand descriptor publication identity mismatch', {
    code: 'E_STRAND_CORRUPT',
    context: expected,
  });
}

async function collectBytes(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of source) {
    chunks.push(chunk);
    size += chunk.byteLength;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
