/**
 * ConflictCandidateCollector — mutable accumulator for conflict candidates.
 *
 * Owns the per-frame analysis pipeline: raw op → canonical op → target identity →
 * effect digest → OpRecord → immediate/eventual candidate classification.
 *
 * @module domain/services/strand/ConflictCandidateCollector
 */

import type ConflictDiagnostic from '../../types/conflict/ConflictDiagnostic.ts';
import type ConflictCandidate from './ConflictCandidate.ts';
import type OpRecord from './OpRecord.ts';
import type ConflictPipelineContext from './ConflictPipelineContext.ts';
import { analyzeFrameOps, addEventualOverrideCandidates, type PatchFrame } from './conflictCandidateAnalysis.ts';

export { inferCausalRelation } from './conflictCandidateAnalysis.ts';

/**
 * Mutable accumulator for conflict candidates during frame analysis.
 *
 * Use the static `collect` factory to build a fully populated instance.
 */
export class ConflictCandidateCollector {
  propertyWinnerByTarget: Map<string, OpRecord>;
  propertyAppliedHistory: Map<string, OpRecord[]>;
  equivalentWinnerByTargetEffect: Map<string, OpRecord>;
  candidates: ConflictCandidate[];

  /**
   * Creates an empty collector. Use `ConflictCandidateCollector.collect()` to populate.
   */
  constructor() {
    this.propertyWinnerByTarget = new Map();
    this.propertyAppliedHistory = new Map();
    this.equivalentWinnerByTargetEffect = new Map();
    this.candidates = [];
  }

  /**
   * Walks all patch frames, builds op records, and classifies conflict candidates.
   */
  static async collect(
    context: ConflictPipelineContext,
    {
      patchFrames,
      scannedPatchShas,
      diagnostics,
    }: {
      patchFrames: PatchFrame[];
      scannedPatchShas: Set<string>;
      diagnostics: ConflictDiagnostic[];
    },
  ): Promise<ConflictCandidateCollector> {
    const collector = new ConflictCandidateCollector();
    for (const frame of patchFrames) {
      await analyzeFrameOps(context, { frame, scannedPatchShas, diagnostics, collector });
    }
    addEventualOverrideCandidates(collector, scannedPatchShas);
    return collector;
  }
}
