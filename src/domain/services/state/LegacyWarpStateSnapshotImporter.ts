import WarpError from '../../errors/WarpError.ts';
import { buildSeekCacheKey } from '../../utils/seekCacheKey.ts';
import type {
  WarpStateCoordinate,
  WarpStateSnapshotRecord,
} from '../../../ports/WarpStateCachePort.ts';

type SeekCacheImportInput = {
  key: string;
  frontier?: Map<string, string> | undefined;
  buffer: Uint8Array;
  indexTreeOid?: string | undefined;
};

type CheckpointImportInput = {
  checkpointSha: string;
  frontier: Map<string, string>;
  ceiling: number | null;
  stateHash: string;
  payloadRef: string;
  indexTreeOid?: string | undefined;
};

function parseLegacySeekCacheKey(key: string): { ceiling: number; frontierHash: string } {
  const colonIndex = key.indexOf(':');
  const encoded = colonIndex >= 0 ? key.slice(colonIndex + 1) : key;
  if (!encoded.startsWith('t')) {
    throw new WarpError(`Invalid legacy seek-cache key: ${key}`, 'E_SEEK_CACHE_KEY');
  }
  const dashIndex = encoded.indexOf('-');
  if (dashIndex < 0) {
    throw new WarpError(`Invalid legacy seek-cache key: ${key}`, 'E_SEEK_CACHE_KEY');
  }
  const ceilingText = encoded.slice(1, dashIndex);
  const ceiling = Number.parseInt(ceilingText, 10);
  if (!Number.isInteger(ceiling)) {
    throw new WarpError(`Invalid legacy seek-cache ceiling: ${key}`, 'E_SEEK_CACHE_KEY');
  }
  return {
    ceiling,
    frontierHash: encoded.slice(dashIndex + 1),
  };
}

function buildImportedSnapshotId(prefix: string, suffix: string): string {
  return `${prefix}:${suffix}`;
}

export default class LegacyWarpStateSnapshotImporter {
  static async fromSeekCacheEntry(input: SeekCacheImportInput): Promise<WarpStateSnapshotRecord> {
    if (input.frontier === undefined) {
      throw new WarpError(
        'frontier must be supplied when importing a legacy seek-cache entry',
        'E_LEGACY_SEEK_CACHE_FRONTIER',
      );
    }
    const parsed = parseLegacySeekCacheKey(input.key);
    const rebuiltKey = await buildSeekCacheKey(parsed.ceiling, input.frontier);
    if (rebuiltKey !== input.key) {
      throw new WarpError(
        'legacy seek-cache frontier does not match the supplied key',
        'E_LEGACY_SEEK_CACHE_FRONTIER_MISMATCH',
      );
    }

    const coordinate: WarpStateCoordinate = {
      frontier: input.frontier,
      ceiling: parsed.ceiling,
    };

    return {
      snapshotId: buildImportedSnapshotId('legacy-seek-cache', input.key),
      coordinate,
      retention: 'evictable',
      provenancePosture: 'degraded',
      stateHash: `legacy-seek-cache:${parsed.frontierHash}`,
      payloadRef: `legacy-seek-cache:${input.key}`,
      createdAt: 'legacy-import',
      ...(input.indexTreeOid !== undefined ? { indexTreeOid: input.indexTreeOid } : {}),
    };
  }

  static async fromCheckpointRecord(input: CheckpointImportInput): Promise<WarpStateSnapshotRecord> {
    return {
      snapshotId: input.checkpointSha,
      coordinate: {
        frontier: input.frontier,
        ceiling: input.ceiling,
      },
      retention: 'pinned',
      provenancePosture: 'full',
      stateHash: input.stateHash,
      payloadRef: input.payloadRef,
      createdAt: 'legacy-import',
      ...(input.indexTreeOid !== undefined ? { indexTreeOid: input.indexTreeOid } : {}),
    };
  }
}
