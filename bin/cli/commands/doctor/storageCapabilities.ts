/** Resolve optional storage capabilities used by `git warp doctor`. */
import { buildWritersPrefix } from '../../../../src/domain/utils/RefLayout.ts';
import type WarpStateCachePort from '../../../../src/ports/WarpStateCachePort.ts';
import type MaterializationCacheDiagnosticsPort
  from '../../../../src/ports/MaterializationCacheDiagnosticsPort.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import defaultCrypto from '../../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import type RuntimeStorageProviderPort from '../../../../src/ports/RuntimeStorageProviderPort.ts';
import {
  createPersistence,
  resolveGraphName,
  type CliStorageBinding,
} from '../../shared.ts';
import type { CliOptions, Persistence } from '../../types.ts';
import type {
  DoctorContext,
  DoctorPolicy,
} from './types.ts';

export type DoctorStorageCapabilities = Readonly<{
  stateCache: WarpStateCachePort | null;
  materializationCacheDiagnostics: MaterializationCacheDiagnosticsPort | null;
}>;

export async function createDoctorContext(
  options: CliOptions,
  policy: DoctorPolicy,
  suppliedStorage?: CliStorageBinding,
): Promise<DoctorContext> {
  const { persistence, runtimeStorage, hookPaths } =
    suppliedStorage ?? await createPersistence(options.repo);
  const graphName = await resolveGraphName(persistence, options.lane);
  const storage = await resolveStorageCapabilities(runtimeStorage, graphName);
  return {
    persistence,
    stateCache: storage.stateCache,
    materializationCacheDiagnostics: storage.materializationCacheDiagnostics,
    graphName,
    writerHeads: await collectWriterHeads(persistence, graphName),
    policy,
    repoPath: options.repo,
    hookPaths,
  };
}

export async function resolveStorageCapabilities(
  runtimeStorage: RuntimeStorageProviderPort,
  graphName: string,
): Promise<DoctorStorageCapabilities> {
  const services = await runtimeStorage.createRuntimeStorageServices({
    timelineName: graphName,
    codec: defaultCodec,
    crypto: defaultCrypto,
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
  });
  return Object.freeze({
    stateCache: services.stateSnapshots ?? null,
    materializationCacheDiagnostics: services.materializationCacheDiagnostics ?? null,
  });
}

async function collectWriterHeads(
  persistence: Persistence,
  graphName: string,
): Promise<Array<{ writerId: string; sha: string | null; ref: string }>> {
  const prefix = buildWritersPrefix(graphName);
  const refs = await persistence.listRefs(prefix);
  const heads = await Promise.all(refs.map(async (ref) => await writerHead(
    persistence,
    prefix,
    ref,
  )));
  return heads
    .filter((head): head is NonNullable<typeof head> => head !== null)
    .sort((a, b) => a.writerId.localeCompare(b.writerId));
}

async function writerHead(
  persistence: Persistence,
  prefix: string,
  ref: string,
): Promise<{ writerId: string; sha: string | null; ref: string } | null> {
  const writerId = ref.slice(prefix.length);
  if (writerId.length === 0) { return null; }
  let sha: string | null = null;
  try {
    sha = await persistence.readRef(ref);
  } catch {
    // Include dangling heads so downstream checks can explain them.
  }
  return { writerId, sha, ref };
}
