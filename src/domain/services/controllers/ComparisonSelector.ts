/**
 * ComparisonSelector — validated comparison selector hierarchy and
 * frontier normalization utilities.
 *
 * Each selector subclass implements `resolve()` with the resolution
 * logic for its kind (live, coordinate, strand, strand_base),
 * eliminating dispatch switches.
 *
 * @module domain/services/controllers/ComparisonSelector
 */

import QueryError from '../../errors/QueryError.ts';
import { callInternalRuntimeMethod } from '../../utils/callInternalRuntimeMethod.ts';
import createStrandCoordinator from '../strand/createStrandCoordinator.ts';
import type { WarpState } from '../JoinReducer.ts';
import type {
  VisibleStateScope,
  CoordinateComparisonSelectorInput,
} from '../../types/CoordinateComparison.ts';
import type {
  ComparisonCoordinateSideReadPort,
} from './ComparisonCoordinateSideReadPort.ts';
import type ComparisonSideFinalizer from './ComparisonSideFinalizerPort.ts';
import {
  buildStrandMetadata,
  finalizeSide,
  normalizeFrontierRecord,
  normalizeLamportCeiling,
  normalizeRequiredString,
  optionalCeiling,
} from './ComparisonSelectorSupport.ts';
import type {
  ComparisonHost,
  ResolvedComparisonSide,
} from './ComparisonSelectorSupport.ts';

export {
  compareStrings,
  normalizeLamportCeiling,
  normalizeOptionalString,
  normalizeRequiredString,
  normalizeFrontierRecord,
  frontierRecordToMap,
  optionalCeiling,
  combineCeilings,
  buildCoordinateRequest,
  patchFrontierFromEntries,
  lamportFrontierFromEntries,
  uniqueSortedPatchShas,
  collectPatchEntriesForFrontier,
  buildStrandMetadata,
  computeStateHashForGraph,
  ResolvedComparisonSide,
  finalizeSide,
} from './ComparisonSelectorSupport.ts';

export type {
  PatchEntry,
  MaterializeCoordinateOptions,
  ComparisonDigestHost,
  ComparisonPatchEntrySource,
  ComparisonCoordinateSideReadSource,
  ComparisonHost,
  ComparisonRequestedSide,
  StrandComparisonMetadata,
  ComparisonResolvedSide,
} from './ComparisonSelectorSupport.ts';

export type ComparisonSelectorContext = {
  readonly coordinateReader: ComparisonCoordinateSideReadPort;
  readonly sideFinalizer: ComparisonSideFinalizer;
  readonly strandGraph: ComparisonHost;
};

export abstract class NormalizedSelector {
  readonly kind: 'live' | 'coordinate' | 'strand' | 'strand_base';
  readonly ceiling: number | null;

  constructor(
    kind: 'live' | 'coordinate' | 'strand' | 'strand_base',
    ceiling: number | null,
  ) {
    this.kind = kind;
    this.ceiling = ceiling;
  }

  abstract resolve(
    context: ComparisonSelectorContext,
    scope: VisibleStateScope | null,
    liveFrontier: Map<string, string> | null,
  ): Promise<ResolvedComparisonSide>;
}

export class LiveComparisonSelector extends NormalizedSelector {
  constructor(ceiling: number | null) { super('live', ceiling); }

  async resolve(context: ComparisonSelectorContext, scope: VisibleStateScope | null, liveFrontier: Map<string, string> | null) {
    const frontier = liveFrontier ?? await context.coordinateReader.liveFrontier();
    const read = await context.coordinateReader.readLiveSide({
      frontier,
      ceiling: this.ceiling,
    });
    return await context.sideFinalizer.finalize(read, scope);
  }
}

export class CoordinateComparisonSelector extends NormalizedSelector {
  readonly frontier: Record<string, string>;

  constructor(frontier: Record<string, string>, ceiling: number | null) {
    super('coordinate', ceiling);
    this.frontier = frontier;
  }

  async resolve(context: ComparisonSelectorContext, scope: VisibleStateScope | null) {
    const read = await context.coordinateReader.readCoordinateSide({
      frontier: this.frontier,
      ceiling: this.ceiling,
    });
    return await context.sideFinalizer.finalize(read, scope);
  }
}

/**
 * Assertion narrowing ComparisonHost to the strand coordinator's
 * parameter type.
 *
 * ComparisonHost is the structural subset of WarpRuntime that
 * comparison needs. The strand coordinator's parameter type
 * (exported only by inference) wants a wider WarpRuntime surface.
 * At runtime WarpRuntime is passed (it satisfies both), so the
 * assertion narrows the type without a value-level cast.
 */
function assertStrandCoordinatorHost(
  graph: ComparisonHost,
): asserts graph is ComparisonHost & Parameters<typeof createStrandCoordinator>[0] {
  void graph;
}

/**
 * Helper: obtain a strand coordinator for a ComparisonHost.
 */
function strandCoordinatorFor(graph: ComparisonHost): ReturnType<typeof createStrandCoordinator> {
  assertStrandCoordinatorHost(graph);
  return createStrandCoordinator(graph);
}

export class StrandComparisonSelector extends NormalizedSelector {
  readonly strandId: string;

  constructor(strandId: string, ceiling: number | null) {
    super('strand', ceiling);
    this.strandId = strandId;
  }

  async resolve(context: ComparisonSelectorContext, scope: VisibleStateScope | null) {
    const graph = context.strandGraph;
    const strands = strandCoordinatorFor(graph);
    const descriptor = await strands.getOrThrow(this.strandId);
    const state = await callInternalRuntimeMethod<WarpState>(
      graph, 'materializeStrand', this.strandId,
      this.ceiling === null ? undefined : { ceiling: this.ceiling },
    );
    const patchEntries = await strands.getPatchEntries(
      this.strandId, this.ceiling === null ? undefined : { ceiling: this.ceiling },
    );
    return await finalizeSide(graph, {
      requested: { kind: 'strand', strandId: this.strandId, ...optionalCeiling(this.ceiling) },
      state, patchEntries, coordinateKind: 'strand', lamportCeiling: this.ceiling,
      strand: buildStrandMetadata(this.strandId, descriptor),
    }, scope);
  }
}

export class StrandBaseComparisonSelector extends NormalizedSelector {
  readonly strandId: string;

  constructor(strandId: string, ceiling: number | null) {
    super('strand_base', ceiling);
    this.strandId = strandId;
  }

  async resolve(context: ComparisonSelectorContext, scope: VisibleStateScope | null) {
    const read = await context.coordinateReader.readStrandBaseSide({
      strandId: this.strandId,
      ceiling: this.ceiling,
    });
    return await context.sideFinalizer.finalize(read, scope);
  }
}

// ── Selector normalization ───────────────────────────────────────────

export function normalizeSelector(
  selector: CoordinateComparisonSelectorInput,
  field: string,
): NormalizedSelector {
  if (selector === null || selector === undefined || typeof selector !== 'object') {
    throw new QueryError(`${field} must be a selector object`, {
      code: 'invalid_coordinate', context: { field },
    });
  }
  const { kind } = selector;
  if (kind === 'live') {
    return new LiveComparisonSelector(normalizeLamportCeiling(selector.ceiling, `${field}.ceiling`));
  }
  if (kind === 'coordinate') {
    return new CoordinateComparisonSelector(
      normalizeFrontierRecord(selector.frontier, `${field}.frontier`),
      normalizeLamportCeiling(selector.ceiling, `${field}.ceiling`),
    );
  }
  if (kind === 'strand' || kind === 'strand_base') {
    const strandId = normalizeRequiredString(selector.strandId, `${field}.strandId`);
    const ceiling = normalizeLamportCeiling(selector.ceiling, `${field}.ceiling`);
    return kind === 'strand_base'
      ? new StrandBaseComparisonSelector(strandId, ceiling)
      : new StrandComparisonSelector(strandId, ceiling);
  }
  throw new QueryError(`${field}.kind is unsupported`, { code: 'invalid_coordinate', context: { field, kind } });
}
