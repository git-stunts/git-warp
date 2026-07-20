import type ProjectionHandle from '../ProjectionHandle.ts';
import type WorldlineOptic from '../optic/WorldlineOptic.ts';
import type ReadIdentity from '../optic/ReadIdentity.ts';
import type { PrecommitGuard } from '../../types/WarpIntentDescriptor.ts';
import type { PropValue } from '../../types/PropValue.ts';
import { canonicalStringify } from '../../utils/canonicalStringify.ts';
import { compareStrings } from '../../utils/StringComparison.ts';
import type { WorldlineOptions } from '../../capabilities/QueryCapability.ts';
import WarpError from '../../errors/WarpError.ts';

export type BoundedIntentGuardReading = Readonly<{
  value: PropValue | undefined;
  readIdentity: ReadIdentity;
}>;

export type BoundedIntentGuardSource = {
  readonly _graphName: string;
  readonly worldline: (options?: WorldlineOptions) => ProjectionHandle;
  readonly _readCheckpointSha: () => Promise<string | null>;
  readonly getFrontier: () => Promise<Map<string, string>>;
};

/** Reads one guard property through checkpoint-tail causal support only. */
export default class BoundedIntentGuardReader {
  readonly evaluationCoordinateRef: string;
  readonly #worldline: ProjectionHandle;
  #optic: WorldlineOptic | null;

  constructor(worldline: ProjectionHandle, evaluationCoordinateRef: string) {
    this.#worldline = worldline;
    this.#optic = null;
    this.evaluationCoordinateRef = evaluationCoordinateRef;
    Object.freeze(this);
  }

  async read(guard: PrecommitGuard): Promise<BoundedIntentGuardReading> {
    this.#optic ??= this.#worldline.optic();
    const reading = await this.#optic
      .node(guard.nodeId)
      .prop(guardPropertyKey(guard))
      .read();
    return Object.freeze({
      value: reading.value,
      readIdentity: reading.readIdentity,
    });
  }
}

/** Captures one coordinate so every guard observes the same causal basis. */
export async function captureBoundedIntentGuardReader(
  source: BoundedIntentGuardSource,
): Promise<BoundedIntentGuardReader> {
  const checkpointSha = await source._readCheckpointSha();
  if (checkpointSha === null) {
    return new BoundedIntentGuardReader(
      source.worldline(),
      missingBoundedBasisCoordinateRef(source._graphName),
    );
  }
  const frontier = await source.getFrontier();
  return new BoundedIntentGuardReader(source.worldline({
    source: { kind: 'coordinate', checkpointSha, frontier },
  }), checkpointTailCoordinateRef(source._graphName, checkpointSha, frontier));
}

function checkpointTailCoordinateRef(
  worldline: string,
  checkpointSha: string,
  frontier: ReadonlyMap<string, string>,
): string {
  const frontierEntries = [...frontier]
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([writerId, patchSha]) => ({ writerId, patchSha }));
  return `warp:graph-coordinate:${canonicalStringify({
    worldline,
    checkpointSha,
    frontier: frontierEntries,
  })}`;
}

function missingBoundedBasisCoordinateRef(worldline: string): string {
  return `warp:graph-coordinate:${canonicalStringify({
    worldline,
    basis: 'missing-checkpoint',
  })}`;
}

function guardPropertyKey(guard: PrecommitGuard): string {
  if (guard.op === 'nodeStatus') {
    return 'status';
  }
  if (guard.op === 'nodeUnassignedOrSelf') {
    return 'agentId';
  }
  const unsupported: never = guard;
  throw new WarpError(
    `Unsupported precommit guard: ${String((unsupported as { op?: string }).op)}`,
    'E_VALIDATION'
  );
}

export function boundedIntentGuardEvidenceRef(identity: ReadIdentity): string {
  return `warp:read-identity:${canonicalStringify(identity)}`;
}
