import type AllocationProvenance from '../domain/migrations/AllocationProvenance.ts';

/** Resolves retained allocation provenance through the v21 migration record (#1015). */
export default abstract class AllocationProvenancePort {
  /**
   * Resolves the admission at `operationIndex` of `commit`, whose patch
   * carries `original` as its allocation dot.
   */
  abstract resolve(_commit: string, _operationIndex: number, _original: string): Promise<AllocationProvenance>;
}
