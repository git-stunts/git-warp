import type { ContentMetadataInput } from '../domain/api/ContentMetadataInput.ts';
import type StagedContent from '../domain/api/StagedContent.ts';
import WarpError from '../domain/errors/WarpError.ts';
import ConeLaneBasis from '../domain/services/cone/ConeLaneBasis.ts';
import ContentStagingAuthority from '../domain/services/ContentStagingAuthority.ts';
import ObservationCustodyService from '../domain/services/custody/ObservationCustodyService.ts';
import ObservationSupportLimits from '../domain/services/custody/ObservationSupportLimits.ts';
import ConeReadExecutor from '../domain/services/read/ConeReadExecutor.ts';
import ConeWriteExecutor from '../domain/services/write/ConeWriteExecutor.ts';
import ConeWriteLowering from '../domain/services/write/ConeWriteLowering.ts';
import ConeWritePublisher from '../domain/services/write/ConeWritePublisher.ts';
import ConeWriteRecovery from '../domain/services/write/ConeWriteRecovery.ts';
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
import type ObservationAttemptSourcePort from '../ports/ObservationAttemptSourcePort.ts';
import type ObservationCustodyPort from '../ports/ObservationCustodyPort.ts';
import type WarpAccessPort from '../ports/WarpAccessPort.ts';
import GitStorage from './GitStorage.ts';
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
  readonly recovery: ConeWriteRecovery;
  readonly custody: ObservationCustodyService;
  readonly reads: ConeReadExecutor;
  stage(writer: string, staged: { readonly content: string; readonly metadata: ContentMetadataInput | undefined }): Promise<StagedContent>;
  close(): Promise<void>;
};

type WriterHosts = (writer: string) => Promise<RuntimeHostProduct>;

/** Composes one graph's write path over one opened Git repository. */
export async function composeWarpWrites(
  address: WarpAddress,
  access: WarpAccessPort,
): Promise<WarpWrites> {
  const overrides = COMPOSITION_OVERRIDES.get(access) ?? {};
  const storage = await GitStorage.open({ cwd: gitStorageLocation(address.storage) });
  try {
    const writes = await composeOverStorage({ address, access, overrides, storage });
    await writes.recovery.sweep();
    return writes;
  } catch (error) {
    await storage.close();
    throw error;
  }
}

async function composeOverStorage(run: {
  readonly address: WarpAddress;
  readonly access: WarpAccessPort;
  readonly overrides: WarpCompositionOverrides;
  readonly storage: GitStorage;
}): Promise<WarpWrites> {
  const { access, overrides, storage, address: { name: graph } } = run;
  const ports = getDefaultRuntimeHostNodePorts();
  const git = resolveConeWrites(storage);
  const hosts = writerHosts({ graph, storage, ports });
  const custody = await openCustodyService({ graph, git, ports, overrides });
  const journal = new GitWriteAttemptJournalAdapter({ graph, history: git.history, codec: ports.codec, custodyCodec: new ObservationCustodyCborCodec(ports.codec) });
  const probe = new WritePublicationProbe({ graph, history: git.history, messages: ports.commitMessageCodec });
  const settlement = new ConeWriteSettlement({ graph, custody, journal });
  const clock = overrides.clock ?? (() => Date.now());
  const content = new ContentStagingAuthority();
  const recovery = new ConeWriteRecovery({ graph, custody, journal, probe, settlement, clock });
  const cone = await openCone({ graph, git, ports, storage });
  return {
    custody, recovery,
    reads: new ConeReadExecutor({ graph, access, cone }),
    executor: new ConeWriteExecutor({
      graph, access, recovery,
      lowering: new ConeWriteLowering({ graph, cone, content, crypto: ports.crypto, openPatch: async (writer) => await (await hosts(writer)).createPatch() }),
      publisher: new ConeWritePublisher({ graph, custody, journal, probe, settlement, clock, attempts: overrides.attempts ?? new EntropyObservationAttemptSource() }),
    }),
    stage: async (writer, staged) => await content.stage({ assetStorage: (await hosts(writer))._assetStorage, content: staged.content, metadata: staged.metadata, slug: `${graph}/${writer}` }),
    close: async () => await storage.close(),
  };
}

function writerHosts(fields: {
  readonly graph: string;
  readonly storage: GitStorage;
  readonly ports: RuntimeHostNodePorts;
}): WriterHosts {
  const { graph, storage, ports } = fields;
  const binding = resolveWarpStorage(storage);
  const opened = new Map<string, Promise<RuntimeHostProduct>>();
  return async (writer) => {
    const known = opened.get(writer) ?? openRuntimeHostProduct({
      persistence: binding.history, runtimeStorage: binding.runtimeStorage, graphName: graph, writerId: writer,
      codec: ports.codec, crypto: ports.crypto, random: ports.random, trustCrypto: ports.trustCrypto, commitMessageCodec: ports.commitMessageCodec,
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
