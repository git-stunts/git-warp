import WarpError from '../errors/WarpError.ts';
import MaterializationHandle from './MaterializationHandle.ts';

export type LiveMaterializationSource = 'empty' | 'retained' | 'materialized';

export type LiveMaterializationResolutionOptions =
  | Readonly<{
    materialization: null;
    source: 'empty';
    replayedPatchCount: 0;
    release: () => Promise<void>;
  }>
  | Readonly<{
    materialization: MaterializationHandle;
    source: 'retained';
    replayedPatchCount: 0;
    release: () => Promise<void>;
  }>
  | Readonly<{
    materialization: MaterializationHandle;
    source: 'materialized';
    replayedPatchCount: number;
    release: () => Promise<void>;
  }>;

const LIVE_MATERIALIZATION_SOURCES = new Set<LiveMaterializationSource>([
  'empty',
  'retained',
  'materialized',
]);

/** Validated operation-scoped access to a live materialization handle. */
export default class LiveMaterializationResolution {
  readonly materialization: MaterializationHandle | null;
  readonly source: LiveMaterializationSource;
  readonly replayedPatchCount: number;
  readonly #releaseOperation: () => Promise<void>;

  constructor(options: LiveMaterializationResolutionOptions | null | undefined) {
    const fields = requireOptions(options);
    const materialization = requireMaterialization(fields.materialization);
    const source = requireSource(fields.source);
    const replayedPatchCount = requirePatchCount(fields.replayedPatchCount);
    const releaseOperation = requireRelease(fields.release);
    validateCombination({ materialization, source, replayedPatchCount });

    this.materialization = materialization;
    this.source = source;
    this.replayedPatchCount = replayedPatchCount;
    this.#releaseOperation = releaseOperation;
    Object.freeze(this);
  }

  release(): Promise<void> {
    return this.#releaseOperation();
  }
}

function requireOptions(
  options: LiveMaterializationResolutionOptions | null | undefined,
): LiveMaterializationResolutionOptions {
  if (options === null || options === undefined) {
    throw resolutionError('options are required');
  }
  return options;
}

function requireMaterialization(
  materialization: MaterializationHandle | null,
): MaterializationHandle | null {
  if (materialization !== null && !(materialization instanceof MaterializationHandle)) {
    throw resolutionError('materialization has an invalid runtime identity');
  }
  return materialization;
}

function requireSource(source: LiveMaterializationSource): LiveMaterializationSource {
  if (!LIVE_MATERIALIZATION_SOURCES.has(source)) {
    throw resolutionError('source is invalid');
  }
  return source;
}

function requirePatchCount(replayedPatchCount: number): number {
  if (!Number.isSafeInteger(replayedPatchCount) || replayedPatchCount < 0) {
    throw resolutionError('replayedPatchCount must be a non-negative safe integer');
  }
  return replayedPatchCount;
}

function requireRelease(release: () => Promise<void>): () => Promise<void> {
  if (typeof release !== 'function') {
    throw resolutionError('release must be a function');
  }
  return release;
}

function validateCombination(fields: Readonly<{
  materialization: MaterializationHandle | null;
  source: LiveMaterializationSource;
  replayedPatchCount: number;
}>): void {
  if (fields.source === 'empty') {
    validateEmptyCombination(fields);
    return;
  }
  if (fields.materialization === null) {
    throw resolutionError(`${fields.source} source requires a materialization`);
  }
  if (fields.source === 'retained') {
    validateRetainedCombination(fields.replayedPatchCount);
  }
}

function validateEmptyCombination(fields: Readonly<{
  materialization: MaterializationHandle | null;
  replayedPatchCount: number;
}>): void {
  if (fields.materialization !== null || fields.replayedPatchCount !== 0) {
    throw resolutionError('empty source cannot carry a materialization or replayed patches');
  }
}

function validateRetainedCombination(replayedPatchCount: number): void {
  if (replayedPatchCount !== 0) {
    throw resolutionError('retained source cannot report replayed patches');
  }
}

function resolutionError(message: string): WarpError {
  return new WarpError(
    `Live materialization resolution ${message}`,
    'E_MATERIALIZATION_RESOLUTION',
  );
}
