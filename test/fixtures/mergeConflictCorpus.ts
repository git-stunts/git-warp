export type MergeConflictClass = 'projection' | 'semantic' | 'governance';

export type MergeConflictDomain =
  | 'api-docs'
  | 'architecture-docs'
  | 'cli'
  | 'dependency-policy'
  | 'method'
  | 'runtime'
  | 'testing';

export type MergeConflictCorpusCase = {
  readonly id: string;
  readonly classification: MergeConflictClass;
  readonly domain: MergeConflictDomain;
  readonly sourceAnchors: readonly string[];
  readonly filePaths: readonly string[];
  readonly writers: readonly string[];
  readonly scenario: string;
  readonly liftingStrategy: string;
  readonly liftingRemovesConflict: boolean;
  readonly benchmarkWeight: number;
};

export type MergeConflictCorpusSummary = {
  readonly total: number;
  readonly projection: number;
  readonly semantic: number;
  readonly governance: number;
  readonly liftedAway: number;
  readonly requiresPolicy: number;
  readonly weightedCases: number;
};

type CorpusArchetype = {
  readonly slug: string;
  readonly classification: MergeConflictClass;
  readonly domain: MergeConflictDomain;
  readonly sourceAnchors: readonly string[];
  readonly scenario: string;
  readonly liftingStrategy: string;
  readonly liftingRemovesConflict: boolean;
  readonly benchmarkWeight: number;
};

type CorpusVariant = {
  readonly slug: string;
  readonly primaryFile: string;
  readonly secondaryFile: string;
  readonly writers: readonly string[];
};

const variants: readonly CorpusVariant[] = Object.freeze([
  {
    slug: 'readme-api-reference',
    primaryFile: 'README.md',
    secondaryFile: 'docs/API_REFERENCE.md',
    writers: Object.freeze(['docs-a', 'api-b']),
  },
  {
    slug: 'guide-cli',
    primaryFile: 'docs/GUIDE.md',
    secondaryFile: 'docs/CLI_GUIDE.md',
    writers: Object.freeze(['guide-a', 'cli-b']),
  },
  {
    slug: 'architecture-vision',
    primaryFile: 'docs/ARCHITECTURE.md',
    secondaryFile: 'docs/VISION.md',
    writers: Object.freeze(['arch-a', 'vision-b']),
  },
  {
    slug: 'changelog-package',
    primaryFile: 'CHANGELOG.md',
    secondaryFile: 'package.json',
    writers: Object.freeze(['release-a', 'release-b']),
  },
  {
    slug: 'runtime-controller',
    primaryFile: 'src/domain/RuntimeHost.ts',
    secondaryFile: 'src/domain/services/controllers/StrandController.ts',
    writers: Object.freeze(['runtime-a', 'runtime-b']),
  },
  {
    slug: 'conflict-service',
    primaryFile: 'src/domain/services/strand/ConflictAnalyzerService.ts',
    secondaryFile: 'test/unit/domain/services/strand/ConflictAnalyzerService.test.ts',
    writers: Object.freeze(['conflict-a', 'conflict-b']),
  },
  {
    slug: 'method-retro',
    primaryFile: 'docs/METHOD.md',
    secondaryFile: 'docs/method/retro/0012-conflict-analyzer-pipeline-decomposition/retro.md',
    writers: Object.freeze(['method-a', 'retro-b']),
  },
  {
    slug: 'type-surface',
    primaryFile: 'index.ts',
    secondaryFile: 'test/type-check/v19-consumer.ts',
    writers: Object.freeze(['surface-a', 'surface-b']),
  },
  {
    slug: 'release-tooling',
    primaryFile: 'scripts/release-preflight.sh',
    secondaryFile: 'docs/method/release.md',
    writers: Object.freeze(['tooling-a', 'release-b']),
  },
  {
    slug: 'benchmark-tests',
    primaryFile: 'test/benchmark/DetachedReadBoundary.benchmark.ts',
    secondaryFile: 'test/unit/scripts/run-stable-unit-tests.test.ts',
    writers: Object.freeze(['bench-a', 'test-b']),
  },
]);

const archetypes: readonly CorpusArchetype[] = Object.freeze([
  {
    slug: 'lossy-rendered-view',
    classification: 'projection',
    domain: 'api-docs',
    sourceAnchors: Object.freeze([
      'docs/design/merge-geometry-and-theorem-spine.tex',
      'docs/design/merge-lifting-worked-examples.tex',
    ]),
    scenario: 'Two edits commute in structured source but collide after lowering into a rendered view.',
    liftingStrategy: 'Lift paragraphs, table rows, or option entries by stable semantic keys before merge.',
    liftingRemovesConflict: true,
    benchmarkWeight: 2,
  },
  {
    slug: 'formatting-shadow',
    classification: 'projection',
    domain: 'architecture-docs',
    sourceAnchors: Object.freeze([
      'docs/design/causal-lifting-and-merge-conflicts.tex',
      'docs/design/merge-lifting-worked-examples.tex',
    ]),
    scenario: 'A formatter or section move makes independent edits appear adjacent in text.',
    liftingStrategy: 'Lift through the document outline and compare only keyed content fragments.',
    liftingRemovesConflict: true,
    benchmarkWeight: 1,
  },
  {
    slug: 'singleton-slot',
    classification: 'semantic',
    domain: 'runtime',
    sourceAnchors: Object.freeze([
      'docs/design/merge-lifting-worked-examples.tex',
      'docs/invariants/explicit-conflict-surfacing.md',
    ]),
    scenario: 'Two branches assign incompatible values to the same invariant-bearing singleton.',
    liftingStrategy: 'Preserve both alternatives and emit an explicit conflict object for later policy.',
    liftingRemovesConflict: false,
    benchmarkWeight: 3,
  },
  {
    slug: 'exclusive-invariant',
    classification: 'semantic',
    domain: 'testing',
    sourceAnchors: Object.freeze([
      'docs/design/merge-geometry-and-theorem-spine.tex',
      'docs/archive/plans/conflict-analyzer-v1.md',
    ]),
    scenario: 'Both branches satisfy local invariants but their combined state violates the global invariant.',
    liftingStrategy: 'Keep causal evidence and classify the obstruction instead of selecting a silent winner.',
    liftingRemovesConflict: false,
    benchmarkWeight: 3,
  },
  {
    slug: 'release-authority',
    classification: 'governance',
    domain: 'dependency-policy',
    sourceAnchors: Object.freeze([
      'docs/method/release.md',
      'docs/invariants/explicit-conflict-surfacing.md',
    ]),
    scenario: 'Two valid edits require incompatible release, trust, or dependency authority decisions.',
    liftingStrategy: 'Surface the competing authority claims and require an operator decision.',
    liftingRemovesConflict: false,
    benchmarkWeight: 2,
  },
  {
    slug: 'workflow-state',
    classification: 'governance',
    domain: 'method',
    sourceAnchors: Object.freeze([
      'docs/METHOD.md',
      'docs/design/0012-conflict-analyzer-pipeline-decomposition/conflict-analyzer-pipeline-decomposition.md',
    ]),
    scenario: 'Two branches move work through mutually exclusive workflow states.',
    liftingStrategy: 'Lift issue state, dependency state, and acceptance evidence before applying workflow policy.',
    liftingRemovesConflict: false,
    benchmarkWeight: 2,
  },
]);

function buildCase(archetype: CorpusArchetype, variant: CorpusVariant): MergeConflictCorpusCase {
  return Object.freeze({
    id: `${archetype.classification}.${archetype.slug}.${variant.slug}`,
    classification: archetype.classification,
    domain: archetype.domain,
    sourceAnchors: Object.freeze([...archetype.sourceAnchors]),
    filePaths: Object.freeze([variant.primaryFile, variant.secondaryFile]),
    writers: Object.freeze([...variant.writers]),
    scenario: `${archetype.scenario} Corpus slice: ${variant.slug}.`,
    liftingStrategy: archetype.liftingStrategy,
    liftingRemovesConflict: archetype.liftingRemovesConflict,
    benchmarkWeight: archetype.benchmarkWeight,
  });
}

function buildCorpus(): readonly MergeConflictCorpusCase[] {
  return Object.freeze(archetypes.flatMap((archetype) => (
    variants.map((variant) => buildCase(archetype, variant))
  )));
}

export const MERGE_CONFLICT_CORPUS = buildCorpus();

export function summarizeMergeConflictCorpus(
  cases: readonly MergeConflictCorpusCase[] = MERGE_CONFLICT_CORPUS,
): MergeConflictCorpusSummary {
  let projection = 0;
  let semantic = 0;
  let governance = 0;
  let liftedAway = 0;
  let weightedCases = 0;

  for (const item of cases) {
    if (item.classification === 'projection') {
      projection += 1;
    } else if (item.classification === 'semantic') {
      semantic += 1;
    } else {
      governance += 1;
    }
    if (item.liftingRemovesConflict) {
      liftedAway += 1;
    }
    weightedCases += item.benchmarkWeight;
  }

  return Object.freeze({
    total: cases.length,
    projection,
    semantic,
    governance,
    liftedAway,
    requiresPolicy: cases.length - liftedAway,
    weightedCases,
  });
}
