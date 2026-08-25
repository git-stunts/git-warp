import Plumbing from '@git-stunts/plumbing';
import RuntimeHost from '../../src/domain/RuntimeHost.ts';
import type MaterializationCoordinate
  from '../../src/domain/materialization/MaterializationCoordinate.ts';
import type MaterializationHandle
  from '../../src/domain/materialization/MaterializationHandle.ts';
import type WarpState from '../../src/domain/services/state/WarpState.ts';
import GitCasRepositoryAdapter
  from '../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import GitTimelineHistoryAdapter, {
  type CollectableStream,
  type GitPlumbing,
} from '../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import { TrailerCommitMessageCodecAdapter }
  from '../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import WebCryptoAdapter from '../../src/infrastructure/adapters/WebCryptoAdapter.ts';
import defaultCodec from '../../src/infrastructure/codecs/CborCodec.ts';
import MaterializationStorePort, {
  type MaterializationAcquisition,
  type MaterializationPredecessorPredicate,
  type RetainMaterializationRequest,
} from '../../src/ports/MaterializationStorePort.ts';
import type MaterializationWorkspacePort
  from '../../src/ports/MaterializationWorkspacePort.ts';
import type RuntimeStorageProviderPort from '../../src/ports/RuntimeStorageProviderPort.ts';
import type {
  RuntimeStorageRequest,
  RuntimeStorageServices,
} from '../../src/ports/RuntimeStorageProviderPort.ts';
import type { MaterializationEvidence } from './PerformanceModel.ts';
import type {
  PerformanceCatFileSession,
  PerformanceFastImportSession,
  PerformanceGitPlumbing,
  PerformanceMktreeSession,
  PerformanceUpdateRefSession,
} from './PerformanceGitPlumbing.ts';
import RecordingMaterializationWorkspace
  from './RecordingMaterializationWorkspace.ts';

const GRAPH_NAME = 'performance';
const WRITER_ID = 'benchmark-writer';

export type OpenPerformanceRuntime = Readonly<{
  close: () => Promise<void>;
  gitCommandCount: () => number;
  gitCommandHistogram: () => Readonly<Record<string, number>>;
  materializationEvidence: () => MaterializationEvidence;
  runtime: RuntimeHost;
}>;

export async function openPerformanceRuntime(
  repositoryPath: string,
): Promise<OpenPerformanceRuntime> {
  const rawPlumbing = await Plumbing.createDefault({ cwd: repositoryPath });
  const plumbing = new CountingPlumbing(rawPlumbing);
  await plumbing.execute({ args: ['init'] });
  await plumbing.execute({
    args: ['config', 'user.email', 'performance@git-warp.invalid'],
  });
  await plumbing.execute({
    args: ['config', 'user.name', 'git-warp performance'],
  });
  const persistence = new GitTimelineHistoryAdapter({ plumbing });
  const runtimeStorage = new RecordingRuntimeStorageProvider(
    new GitCasRepositoryAdapter({ plumbing, history: persistence }),
  );
  const runtime = await RuntimeHost.open({
    persistence,
    runtimeStorage,
    graphName: GRAPH_NAME,
    writerId: WRITER_ID,
    codec: defaultCodec,
    crypto: new WebCryptoAdapter(),
    commitMessageCodec: new TrailerCommitMessageCodecAdapter(),
    autoMaterialize: false,
  });
  return Object.freeze({
    close: async () => {
      await runtime.close();
      await runtimeStorage.close();
    },
    gitCommandCount: () => plumbing.commandCount,
    gitCommandHistogram: () => plumbing.commandHistogram(),
    materializationEvidence: () => runtimeStorage.evidence(),
    runtime,
  });
}

export class CountingPlumbing implements GitPlumbing {
  readonly emptyTree: string;
  commandCount = 0;
  readonly #commands = new Map<string, number>();
  readonly #delegate: PerformanceGitPlumbing;

  constructor(delegate: PerformanceGitPlumbing) {
    this.#delegate = delegate;
    this.emptyTree = delegate.emptyTree;
  }

  async execute(options: Parameters<GitPlumbing['execute']>[0]): Promise<string> {
    this.#record(options.args);
    return await this.#delegate.execute(options);
  }

  async executeStream(
    options: Parameters<GitPlumbing['executeStream']>[0],
  ): Promise<CollectableStream> {
    this.#record(options.args);
    return await this.#delegate.executeStream(options);
  }

  async openCatFileSession(): Promise<PerformanceCatFileSession> {
    this.#recordCategory('session:cat-file');
    return await this.#delegate.openCatFileSession();
  }

  async openFastImportSession(): Promise<PerformanceFastImportSession> {
    this.#recordCategory('session:fast-import');
    return await this.#delegate.openFastImportSession();
  }

  async openMktreeSession(): Promise<PerformanceMktreeSession> {
    this.#recordCategory('session:mktree');
    return await this.#delegate.openMktreeSession();
  }

  async openUpdateRefSession(): Promise<PerformanceUpdateRefSession> {
    this.#recordCategory('session:update-ref');
    return await this.#delegate.openUpdateRefSession();
  }

  commandHistogram(): Readonly<Record<string, number>> {
    return Object.freeze(Object.fromEntries(this.#commands));
  }

  #record(args: readonly string[]): void {
    this.#recordCategory(commandCategory(args));
  }

  #recordCategory(command: string): void {
    this.commandCount += 1;
    this.#commands.set(command, (this.#commands.get(command) ?? 0) + 1);
  }
}

function commandCategory(args: readonly string[]): string {
  const command = args[0] ?? '<empty>';
  if (command === 'ls-tree') {
    return args.includes('--') ? 'ls-tree:targeted' : 'ls-tree:full';
  }
  if (command === 'cat-file') {
    const mode = args[1] ?? '<missing>';
    return mode.startsWith('--batch-check=')
      ? 'cat-file:batch-check'
      : `cat-file:${mode}`;
  }
  return command;
}

class RecordingMaterializationStore extends MaterializationStorePort {
  exactHits = 0;
  exactLookups = 0;
  predecessorHits = 0;
  predecessorLookups = 0;
  retainRequests = 0;
  readonly #delegate: MaterializationStorePort;

  constructor(delegate: MaterializationStorePort) {
    super();
    this.#delegate = delegate;
  }

  override async openWorkspace(
    coordinate: MaterializationCoordinate,
  ): Promise<MaterializationWorkspacePort> {
    const workspace = await this.#delegate.openWorkspace(coordinate);
    return new RecordingMaterializationWorkspace(workspace, async (request) => {
      this.retainRequests += 1;
      return await workspace.promote(request);
    });
  }

  override async retain(
    request: RetainMaterializationRequest,
  ): Promise<MaterializationHandle> {
    this.retainRequests += 1;
    return await this.#delegate.retain(request);
  }

  override async acquireExact(
    coordinate: MaterializationCoordinate,
  ): Promise<MaterializationAcquisition | null> {
    this.exactLookups += 1;
    const acquisition = await this.#delegate.acquireExact(coordinate);
    if (acquisition !== null) {
      this.exactHits += 1;
    }
    return acquisition;
  }

  override async acquireBestCompatiblePredecessor(
    coordinate: MaterializationCoordinate,
    isCompatible: MaterializationPredecessorPredicate,
  ): Promise<MaterializationAcquisition | null> {
    this.predecessorLookups += 1;
    const acquisition = await this.#delegate.acquireBestCompatiblePredecessor(
      coordinate,
      isCompatible,
    );
    if (acquisition !== null) {
      this.predecessorHits += 1;
    }
    return acquisition;
  }

  override async loadReplayBasis(
    materialization: MaterializationHandle,
  ): Promise<WarpState | null> {
    return await this.#delegate.loadReplayBasis(materialization);
  }

  override async close(): Promise<void> {
    await this.#delegate.close();
  }
}

class RecordingRuntimeStorageProvider implements RuntimeStorageProviderPort {
  readonly #delegate: GitCasRepositoryAdapter;
  #materializations: RecordingMaterializationStore | null = null;

  constructor(delegate: GitCasRepositoryAdapter) {
    this.#delegate = delegate;
  }

  async createRuntimeStorageServices(
    request: RuntimeStorageRequest,
  ): Promise<RuntimeStorageServices> {
    const services = await this.#delegate.createRuntimeStorageServices(request);
    const materializations = new RecordingMaterializationStore(services.materializations);
    this.#materializations = materializations;
    return Object.freeze({ ...services, materializations });
  }

  evidence(): MaterializationEvidence {
    const store = this.#materializations;
    if (store === null) {
      throw new Error('Performance runtime storage services were not created');
    }
    return Object.freeze({
      exactHits: store.exactHits,
      exactLookups: store.exactLookups,
      predecessorHits: store.predecessorHits,
      predecessorLookups: store.predecessorLookups,
      replayedPatches: 0,
      retainRequests: store.retainRequests,
    });
  }

  close(): Promise<void> {
    return this.#delegate.close();
  }
}
