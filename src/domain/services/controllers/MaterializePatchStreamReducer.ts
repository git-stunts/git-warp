import {
  applyFast,
  applyWithDiff,
  applyWithReceipt,
  cloneState,
  createEmptyState,
} from '../JoinReducer.ts';
import { PatchDiff, mergeDiffs } from '../../types/PatchDiff.ts';
import {
  MaterializePatchSummaryAccumulator,
  type MaterializePatchSummary,
} from './MaterializePatchSummary.ts';
import type WarpState from '../state/WarpState.ts';
import type { PatchWithSha } from '../../capabilities/PatchCollector.ts';
import type { TickReceipt } from '../../types/TickReceipt.ts';
import type { MaterializeReduceOutput } from './MaterializeController.ts';
import type { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';

export type MaterializePatchStreamOptions = {
  receipts: boolean;
  wantDiff: boolean;
};

export type MaterializePatchStreamReduction = {
  readonly reduced: MaterializeReduceOutput;
  readonly summary: MaterializePatchSummary;
};

export type MaterializePatchStreamReduceInput = {
  readonly source: AsyncIterable<PatchWithSha>;
  readonly base: WarpState | undefined;
  readonly options: MaterializePatchStreamOptions;
  readonly provenanceBase?: ProvenanceIndex;
};

function initialState(base: WarpState | undefined): WarpState {
  return base === undefined ? createEmptyState() : cloneState(base);
}

async function reduceWithReceipts(
  source: AsyncIterable<PatchWithSha>,
  state: WarpState,
  summary: MaterializePatchSummaryAccumulator,
): Promise<MaterializePatchStreamReduction> {
  const receipts: TickReceipt[] = [];
  for await (const entry of source) {
    summary.record(entry);
    const result = applyWithReceipt(state, entry.patch, entry.sha);
    receipts.push(result.receipt);
  }
  return { reduced: { state, receipts }, summary: summary.toSummary() };
}

async function reduceWithDiff(
  source: AsyncIterable<PatchWithSha>,
  state: WarpState,
  summary: MaterializePatchSummaryAccumulator,
): Promise<MaterializePatchStreamReduction> {
  let diff = PatchDiff.empty();
  for await (const entry of source) {
    summary.record(entry);
    const result = applyWithDiff(state, entry.patch, entry.sha);
    diff = mergeDiffs(diff, result.diff);
  }
  return { reduced: { state, diff }, summary: summary.toSummary() };
}

async function reducePlain(
  source: AsyncIterable<PatchWithSha>,
  state: WarpState,
  summary: MaterializePatchSummaryAccumulator,
): Promise<MaterializePatchStreamReduction> {
  for await (const entry of source) {
    summary.record(entry);
    applyFast(state, entry.patch, entry.sha);
  }
  return { reduced: { state }, summary: summary.toSummary() };
}

export default class MaterializePatchStreamReducer {
  static async reduce(input: MaterializePatchStreamReduceInput): Promise<MaterializePatchStreamReduction> {
    const state = initialState(input.base);
    const summary = new MaterializePatchSummaryAccumulator(input.provenanceBase);

    if (input.options.receipts) {
      return await reduceWithReceipts(input.source, state, summary);
    }
    if (input.options.wantDiff) {
      return await reduceWithDiff(input.source, state, summary);
    }
    return await reducePlain(input.source, state, summary);
  }
}
