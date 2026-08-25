import {
  PERFORMANCE_CORPUS_VERSION,
  type CorpusProfile,
  type MultiPatchCorpusProfile,
} from './PerformanceCorpusModel.ts';
import type { MaterializationEvidence, PerformanceScenarioName } from './PerformanceModel.ts';

export function assertMaterializationEvidence(
  evidence: MaterializationEvidence,
  scenario: PerformanceScenarioName,
  corpus: CorpusProfile
): void {
  assertReuseEvidence(evidence, scenario);
  if (corpus.version === PERFORMANCE_CORPUS_VERSION) {
    assertExactReplayCount(evidence, scenario, corpus);
  }
}

function assertReuseEvidence(
  evidence: MaterializationEvidence,
  scenario: PerformanceScenarioName
): void {
  if (
    evidence.exactHits > evidence.exactLookups ||
    evidence.predecessorHits > evidence.predecessorLookups
  ) {
    throw new Error(`Performance git-cas evidence is inconsistent: ${scenario}`);
  }
  if (
    scenario === 'cold-materialize' &&
    (evidence.exactHits !== 0 ||
      evidence.predecessorHits !== 0 ||
      evidence.replayedPatches === 0 ||
      evidence.retainRequests === 0)
  ) {
    throw new Error('Cold materialization did not prove a cold replay');
  }
  if (
    scenario === 'warm-materialize' &&
    (evidence.exactHits === 0 || evidence.replayedPatches !== 0 || evidence.retainRequests !== 0)
  ) {
    throw new Error('Warm materialization did not prove an exact git-cas hit');
  }
  if (
    scenario === 'incremental-materialize' &&
    (evidence.predecessorHits === 0 || evidence.replayedPatches === 0)
  ) {
    throw new Error('Incremental materialization did not prove git-cas predecessor reuse');
  }
}

function assertExactReplayCount(
  evidence: MaterializationEvidence,
  scenario: PerformanceScenarioName,
  corpus: MultiPatchCorpusProfile
): void {
  const expected =
    scenario === 'cold-materialize'
      ? corpus.basePatchCount
      : scenario === 'warm-materialize'
        ? 0
        : corpus.suffixPatchCount;
  if (evidence.replayedPatches !== expected) {
    throw new Error(`Performance replay count does not match corpus: ${scenario}`);
  }
}
