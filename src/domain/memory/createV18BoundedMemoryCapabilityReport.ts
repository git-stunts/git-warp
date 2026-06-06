import MemoryCapability from './MemoryCapability.ts';
import MemoryCapabilityReport from './MemoryCapabilityReport.ts';

/** Reports the current v18 bounded-memory truth without claiming release completion. */
export default function createV18BoundedMemoryCapabilityReport(): MemoryCapabilityReport {
  return new MemoryCapabilityReport({
    capabilities: [
      new MemoryCapability({
        name: 'memory-budget-contract',
        posture: 'safe',
        evidence: 'WarpMemoryPool deterministic lease and rejection tests',
        note: 'git-warp-owned buffers, decoded batches, caches, and windows can share one explicit budget contract',
      }),
      new MemoryCapability({
        name: 'checkpoint-tail-optics',
        posture: 'transitional',
        evidence: 'checkpoint-tail optic and traversal conformance suites',
        note: 'optic reads fail closed and page traversal, but full product memory-pool wiring is still in progress',
      }),
      new MemoryCapability({
        name: 'graph-wide-materialization',
        posture: 'diagnostic',
        evidence: 'public materialization deprecation contracts',
        note: 'full graph materialization remains available only for diagnostics and compatibility',
      }),
      new MemoryCapability({
        name: 'legacy-query-arrays',
        posture: 'legacy',
        evidence: 'public API cost inventory and v18 #549 gate',
        note: 'unbounded array helpers remain legacy until cursorized public replacements land',
      }),
    ],
  });
}
