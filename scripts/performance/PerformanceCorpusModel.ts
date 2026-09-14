import z from 'zod';
import type { PerformanceScenarioName } from './PerformanceModel.ts';

export const PERFORMANCE_CORPUS_VERSION = 2;

const nonNegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();

const CorpusProfileV1Schema = z
  .object({
    baseNodeCount: positiveInteger,
    edgeCount: nonNegativeInteger,
    format: z.literal('git-warp.performance.corpus/v1'),
    logicalPropertyBytes: nonNegativeInteger,
    nodeCount: positiveInteger,
    propertyBytesPerNode: positiveInteger,
    propertyCount: positiveInteger,
    seed: nonNegativeInteger,
    suffixNodeCount: nonNegativeInteger,
    topology: z.literal('directed-chain'),
    version: z.literal(1),
  })
  .strict();

const CorpusProfileV2Schema = z
  .object({
    baseNodeCount: positiveInteger,
    basePatchCount: positiveInteger,
    edgeCount: nonNegativeInteger,
    format: z.literal('git-warp.performance.corpus/v2'),
    logicalPropertyBytes: nonNegativeInteger,
    nodeCount: positiveInteger,
    propertyBytesPerNode: positiveInteger,
    propertyCount: positiveInteger,
    seed: nonNegativeInteger,
    suffixNodeCount: nonNegativeInteger,
    suffixPatchCount: nonNegativeInteger,
    topology: z.literal('directed-chain'),
    version: z.literal(PERFORMANCE_CORPUS_VERSION),
  })
  .strict();

export const CorpusProfileSchema = z.discriminatedUnion('version', [
  CorpusProfileV1Schema,
  CorpusProfileV2Schema,
]);

export type CorpusProfile = Readonly<z.infer<typeof CorpusProfileSchema>>;
export type MultiPatchCorpusProfile = Readonly<z.infer<typeof CorpusProfileV2Schema>>;

export function assertCorpusShape(corpus: CorpusProfile, scenario: PerformanceScenarioName): void {
  if (corpus.nodeCount !== corpus.baseNodeCount + corpus.suffixNodeCount) {
    throw new Error(`Performance corpus node counts are inconsistent: ${scenario}`);
  }
  if (corpus.edgeCount !== Math.max(0, corpus.nodeCount - 1)) {
    throw new Error(`Performance corpus edge count is inconsistent: ${scenario}`);
  }
  if (corpus.propertyCount !== corpus.nodeCount) {
    throw new Error(`Performance corpus property count is inconsistent: ${scenario}`);
  }
  if (corpus.logicalPropertyBytes !== corpus.nodeCount * corpus.propertyBytesPerNode) {
    throw new Error(`Performance corpus logical size is inconsistent: ${scenario}`);
  }
  if (
    scenario === 'incremental-materialize'
      ? corpus.suffixNodeCount === 0
      : corpus.suffixNodeCount !== 0
  ) {
    throw new Error(`Performance corpus suffix does not match its scenario: ${scenario}`);
  }
  if (corpus.version === PERFORMANCE_CORPUS_VERSION) {
    assertPatchCardinality(corpus, scenario);
  }
}

function assertPatchCardinality(
  corpus: MultiPatchCorpusProfile,
  scenario: PerformanceScenarioName
): void {
  if (corpus.basePatchCount > corpus.baseNodeCount) {
    throw new Error(`Performance corpus has more base patches than nodes: ${scenario}`);
  }
  if (corpus.suffixPatchCount > corpus.suffixNodeCount) {
    throw new Error(`Performance corpus has more suffix patches than nodes: ${scenario}`);
  }
  if (
    scenario === 'incremental-materialize'
      ? corpus.suffixPatchCount === 0
      : corpus.suffixPatchCount !== 0
  ) {
    throw new Error(`Performance corpus patch suffix does not match: ${scenario}`);
  }
}
