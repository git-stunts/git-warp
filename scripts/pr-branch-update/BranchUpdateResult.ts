import type BranchUpdateFailure from './BranchUpdateFailure.ts';
import type BranchUpdateOutcome from './BranchUpdateOutcome.ts';

export type BranchUpdateResult = BranchUpdateOutcome | BranchUpdateFailure;
