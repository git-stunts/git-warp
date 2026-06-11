import MemoryCapability from './MemoryCapability.ts';
import {
  MEMORY_CAPABILITY_DIAGNOSTIC,
  MEMORY_CAPABILITY_LEGACY,
  MEMORY_CAPABILITY_SAFE,
  MEMORY_CAPABILITY_TRANSITIONAL,
} from './MemoryCapabilityPosture.ts';
import MemoryCapabilityReport from './MemoryCapabilityReport.ts';

export const MEMORY_CAPABILITY_MEMORY_BUDGET_CONTRACT = 'memory-budget-contract';
export const MEMORY_CAPABILITY_CHECKPOINT_TAIL_OPTICS = 'checkpoint-tail-optics';
export const MEMORY_CAPABILITY_GRAPH_WIDE_MATERIALIZATION = 'graph-wide-materialization';
export const MEMORY_CAPABILITY_LEGACY_QUERY_ARRAYS = 'legacy-query-arrays';

/** Reports the current bounded-memory truth without claiming release completion. */
export default function createBoundedMemoryCapabilityReport(): MemoryCapabilityReport {
  return new MemoryCapabilityReport({
    capabilities: [
      new MemoryCapability({
        name: MEMORY_CAPABILITY_MEMORY_BUDGET_CONTRACT,
        posture: MEMORY_CAPABILITY_SAFE,
        evidence: 'WarpMemoryPool deterministic lease and rejection tests',
        note: 'git-warp-owned buffers, decoded batches, caches, and windows can share one explicit budget contract',
      }),
      new MemoryCapability({
        name: MEMORY_CAPABILITY_CHECKPOINT_TAIL_OPTICS,
        posture: MEMORY_CAPABILITY_TRANSITIONAL,
        evidence: 'checkpoint-tail optic and traversal conformance suites',
        note: 'optic reads fail closed and page traversal, but full product memory-pool wiring is still in progress',
      }),
      new MemoryCapability({
        name: MEMORY_CAPABILITY_GRAPH_WIDE_MATERIALIZATION,
        posture: MEMORY_CAPABILITY_DIAGNOSTIC,
        evidence: 'public materialization deprecation contracts',
        note: 'full graph materialization remains available only for diagnostics and compatibility',
      }),
      new MemoryCapability({
        name: MEMORY_CAPABILITY_LEGACY_QUERY_ARRAYS,
        posture: MEMORY_CAPABILITY_LEGACY,
        evidence: 'public API cost inventory and bounded-memory #549 gate',
        note: 'unbounded array helpers remain legacy until cursorized public replacements land',
      }),
    ],
  });
}
