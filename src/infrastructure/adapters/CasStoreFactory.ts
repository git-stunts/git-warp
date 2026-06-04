import type LoggerPort from '../../ports/LoggerPort.ts';
import { loadGitCasConstructors } from './gitCasModule.ts';
import LoggerObservabilityBridge from './LoggerObservabilityBridge.ts';

type CasCodecInstance = object;
type CasStoreOptions = {
  plumbing: unknown;
  codec: CasCodecInstance;
  chunking: { strategy: string };
  observability?: unknown;
};

/**
 * Builds the standard CDC-backed git-cas store used by runtime adapters.
 */
export async function createCdcCasStore<CasStore>({
  plumbing,
  logger,
}: {
  plumbing: unknown;
  logger: LoggerPort | undefined;
}): Promise<CasStore> {
  const { ContentAddressableStore, CborCodecCtor } = await loadGitCasConstructors<
    CasStoreOptions,
    CasStore,
    CasCodecInstance
  >();
  const opts: CasStoreOptions = {
    plumbing,
    codec: new CborCodecCtor(),
    chunking: { strategy: 'cdc' },
  };
  if (logger !== undefined) {
    opts.observability = new LoggerObservabilityBridge(logger);
  }
  return new ContentAddressableStore(opts);
}
