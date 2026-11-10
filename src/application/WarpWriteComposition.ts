import type { ContentMetadataInput } from '../domain/api/ContentMetadataInput.ts';
import type StagedContent from '../domain/api/StagedContent.ts';
import WarpError from '../domain/errors/WarpError.ts';
import ConeLaneBasis from '../domain/services/cone/ConeLaneBasis.ts';
import ContentStagingAuthority from '../domain/services/ContentStagingAuthority.ts';
import ObservationCustodyService from '../domain/services/custody/ObservationCustodyService.ts';
import ObservationSupportLimits from '../domain/services/custody/ObservationSupportLimits.ts';
import ConeWriteExecutor from '../domain/services/write/ConeWriteExecutor.ts';
import ConeWriteLowering from '../domain/services/write/ConeWriteLowering.ts';
import ConeWritePublisher from '../domain/services/write/ConeWritePublisher.ts';
import ConeWriteRecovery from '../domain/services/write/ConeWriteRecovery.ts';
import ConeWritePath from '../domain/services/write/ConeWritePath.ts';
import ConeWriteSettlement from '../domain/services/write/ConeWriteSettlement.ts';
import WritePublicationProbe from '../domain/services/write/WritePublicationProbe.ts';
import { openRuntimeHostProduct, type RuntimeHostProduct } from '../domain/warp/RuntimeHostProduct.ts';
import EntropyObservationAttemptSource from '../infrastructure/adapters/EntropyObservationAttemptSource.ts';
import GitCasObservationCustodyAdapter from '../infrastructure/adapters/GitCasObservationCustodyAdapter.ts';
import GitCasObservationSupportAdapter from '../infrastructure/adapters/GitCasObservationSupportAdapter.ts';
import GitConePatchFeedAdapter from '../infrastructure/adapters/GitConePatchFeedAdapter.ts';
import GitConeRecordStoreAdapter from '../infrastructure/adapters/GitConeRecordStoreAdapter.ts';
import GitWriteAttemptJournalAdapter from '../infrastructure/adapters/GitWriteAttemptJournalAdapter.ts';
import ObservationCustodyCborCodec from '../infrastructure/adapters/ObservationCustodyCborCodec.ts';
import type LoggerPort from '../ports/LoggerPort.ts';
import type ObservationAttemptSourcePort from '../ports/ObservationAttemptSourcePort.ts';
import type ObservationCustodyPort from '../ports/ObservationCustodyPort.ts';
import type WarpAccessPort from '../ports/WarpAccessPort.ts';
import GitStorage from './GitStorage.ts';
import GuardedLogger from './GuardedLogger.ts';
import { gitStorageLocation } from './GitStorageLocation.ts';
import { getDefaultRuntimeHostNodePorts, type RuntimeHostNodePorts } from './RuntimeHostNodeDefaults.ts';
import type WarpAddress from './WarpAddress.ts';
import { resolveConeWrites, resolveWarpStorage, type WarpConeWriteStorage } from './WarpStorageRegistry.ts';

/**
 * Every graph's retention capacity, fixed the first time custody opens it. A slot is
 * spent for the graph's life by each attempt not cancelled, and git-cas cannot raise
 * a limit, so a lower value would eventually stop a busy graph accepting writes. Exhaustion
 * still has a typed receipt, but it is not a state an ordinary graph should reach.
 */
export const WARP_RETENTION_SLOTS = Number.MAX_SAFE_INTEGER;

/** Support limits. Lowering one strands Coordinates that crossed it, so treat them as raise-only. */
export const WARP_SUPPORT_LIMITS = new ObservationSupportLimits({
  writers: 4096, dependencies: 4096, frontierBytes: 4 * 1024 * 1024, work: 1_000_000,
});

export type WarpCompositionOverrides = {
  readonly attempts?: ObservationAttemptSourcePort;
  readonly clock?: () => number;
  readonly wrapCustody?: (custody: ObservationCustodyPort) => ObservationCustodyPort;
  readonly limit?: number;
};

const COMPOSITION_OVERRIDES = new WeakMap<WarpAccessPort, WarpCompositionOverrides>();

/** Replaces capabilities for Warps opened with `access`. A test seam, outside the package surface. */
export function overrideWarpComposition(access: WarpAccessPort, overrides: WarpCompositionOverrides): void {
  COMPOSITION_OVERRIDES.set(access, overrides);
}

/** What a Warp drives. */
export type WarpWrites = {
  readonly executor: ConeWriteExecutor;
  /**
   * Opens the write path if no granted operation has yet, which marks the substrate, installs
   * the retention policy and sweeps unfinished attempts, then returns its custody.
   */
  openCustody(): Promise<ObservationCustodyService>;
  stage(writer: string, staged: { readonly content: string; readonly metadata: ContentMetadataInput | undefined }): Promise<StagedContent>;
  close(): Promise<void>;
};

type WriterHosts = (writer: string) => Promise<RuntimeHostProduct>;

type OpenedPath = { readonly custody: ObservationCustodyService; readonly path: ConeWritePath };

/**
 * Composes one graph's write path over one opened Git repository. Composing changes nothing
 * in it: the cone, custody, the retention policy and the sweep wait for the first granted
 * write or reconcile, and a writer's host for its first granted write or stage (#1078).
 */
export async function composeWarpWrites(opening: {
  readonly address: WarpAddress;
  readonly access: WarpAccessPort;
  readonly logger: LoggerPort | undefined;
}): Promise<WarpWrites> {
  const { address, access } = opening;
  const overrides = COMPOSITION_OVERRIDES.get(access) ?? {};
  const logger = opening.logger === undefined ? undefined : new GuardedLogger(opening.logger);
  return composeOverStorage({ address, access, overrides, logger, storage: await GitStorage.open({ cwd: gitStorageLocation(address.storage) }) });
}

function composeOverStorage(run: {
  readonly address: WarpAddress;
  readonly access: WarpAccessPort;
  readonly overrides: WarpCompositionOverrides;
  readonly logger: LoggerPort | undefined;
  readonly storage: GitStorage;
}): WarpWrites {
  const { address, access, overrides, logger, storage } = run;
  const graph = address.name;
  const ports = getDefaultRuntimeHostNodePorts();
  const git = resolveConeWrites(storage);
  const hosts = writerHosts({ graph, storage, ports, logger });
  const content = new ContentStagingAuthority();
  const opened = onFirstUse(async () => await openPath({ graph, git, ports, overrides, storage, content, hosts }));
  return {
    openCustody: async () => (await opened()).custody,
    executor: new ConeWriteExecutor({ graph, access, path: async () => (await opened()).path }),
    stage: async (writer, staged) => await content.stage({ assetStorage: (await hosts(writer))._assetStorage, content: staged.content, metadata: staged.metadata, slug: `${graph}/${writer}` }),
    close: async () => await storage.close(),
  };
}

/** Runs `open` once it succeeds; a failed open is tried again by the next caller. */
function onFirstUse<T>(open: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return async () => {
    const run = pending ?? open();
    pending = run;
    try {
      return await run;
    } catch (error) {
      pending = null;
      throw error;
    }
  };
}

/** Opens the cone and custody, which marks the substrate and installs or verifies the retention policy, then sweeps what earlier processes left. */
async function openPath(fields: {
  readonly graph: string;
  readonly git: WarpConeWriteStorage;
  readonly ports: RuntimeHostNodePorts;
  readonly overrides: WarpCompositionOverrides;
  readonly storage: GitStorage;
  readonly content: ContentStagingAuthority;
  readonly hosts: WriterHosts;
}): Promise<OpenedPath> {
  const { graph, git, ports, overrides, storage, content, hosts } = fields;
  const lowering = new ConeWriteLowering({ graph, cone: await openCone({ graph, git, ports, storage }), content, crypto: ports.crypto, openPatch: async (writer) => await (await hosts(writer)).createPatch() });
  const custody = await openCustodyService({ graph, git, ports, overrides });
  const journal = new GitWriteAttemptJournalAdapter({ graph, history: git.history, codec: ports.codec, custodyCodec: new ObservationCustodyCborCodec(ports.codec) });
  const probe = new WritePublicationProbe({ graph, history: git.history, messages: ports.commitMessageCodec });
  const settlement = new ConeWriteSettlement({ graph, custody, journal });
  const clock = overrides.clock ?? (() => Date.now());
  const recovery = new ConeWriteRecovery({ graph, custody, journal, probe, settlement, clock });
  const publisher = new ConeWritePublisher({ graph, custody, journal, probe, settlement, clock, attempts: overrides.attempts ?? new EntropyObservationAttemptSource() });
  await recovery.sweep();
  return { custody, path: new ConeWritePath({ lowering, publisher, recovery }) };
}

function writerHosts(fields: {
  readonly graph: string;
  readonly storage: GitStorage;
  readonly ports: RuntimeHostNodePorts;
  readonly logger: LoggerPort | undefined;
}): WriterHosts {
  const { graph, storage, ports, logger } = fields;
  const binding = resolveWarpStorage(storage);
  const opened = new Map<string, Promise<RuntimeHostProduct>>();
  return async (writer) => {
    const known = opened.get(writer) ?? openRuntimeHostProduct({
      persistence: binding.history, runtimeStorage: binding.runtimeStorage, graphName: graph, writerId: writer,
      codec: ports.codec, crypto: ports.crypto, random: ports.random, clock: ports.clock, trustCrypto: ports.trustCrypto, commitMessageCodec: ports.commitMessageCodec,
      ...(logger === undefined ? {} : { logger }),
    });
    opened.set(writer, known);
    try {
      return await known;
    } catch (error) {
      opened.delete(writer);
      throw error;
    }
  };
}

async function openCone(fields: {
  readonly graph: string;
  readonly git: WarpConeWriteStorage;
  readonly ports: RuntimeHostNodePorts;
  readonly storage: GitStorage;
}): Promise<ConeLaneBasis> {
  const { graph, git, ports, storage } = fields;
  const services = await resolveWarpStorage(storage).runtimeStorage.createRuntimeStorageServices({
    timelineName: graph, codec: ports.codec, crypto: ports.crypto, commitMessageCodec: ports.commitMessageCodec,
  });
  return ConeLaneBasis.ofLane({
    lane: graph,
    store: new GitConeRecordStoreAdapter({ history: git.history, codec: ports.codec }),
    feed: new GitConePatchFeedAdapter({ history: git.history, journal: services.patchJournal, commitMessageCodec: ports.commitMessageCodec }),
  });
}

async function openCustodyService(fields: {
  readonly graph: string;
  readonly git: WarpConeWriteStorage;
  readonly ports: RuntimeHostNodePorts;
  readonly overrides: WarpCompositionOverrides;
}): Promise<ObservationCustodyService> {
  const { graph, git, ports, overrides } = fields;
  const custody = await GitCasObservationCustodyAdapter.open({
    reservations: git.reservations, graphName: graph, limit: overrides.limit ?? WARP_RETENTION_SLOTS, crypto: ports.crypto,
  });
  if (!(custody instanceof GitCasObservationCustodyAdapter)) {
    throw new WarpError('This graph\'s retention store did not open', 'E_WARP_RETENTION_OPEN');
  }
  return new ObservationCustodyService({
    custody: overrides.wrapCustody === undefined ? custody : overrides.wrapCustody(custody),
    support: new GitCasObservationSupportAdapter({
      publications: git.publications, assets: git.assets, history: git.history, crypto: ports.crypto,
      codec: ports.codec, graphName: graph, limits: WARP_SUPPORT_LIMITS,
    }),
    codec: new ObservationCustodyCborCodec(ports.codec),
    crypto: ports.crypto,
    attempts: new EntropyObservationAttemptSource(),
  });
}
