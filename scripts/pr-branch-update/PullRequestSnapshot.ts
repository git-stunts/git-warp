import type Mergeability from './Mergeability.ts';
import PrBranchUpdateError from './PrBranchUpdateError.ts';

const OBJECT_ID = /^[0-9a-f]{40}$/u;

export type PullRequestSnapshotFields = {
  readonly number: number;
  readonly baseRefName: string;
  readonly headRefName: string;
  readonly headOid: string;
  readonly isDraft: boolean;
  readonly isFork: boolean;
  readonly mergeability: Mergeability;
  readonly behindBy: number;
};

/**
 * One open pull request as the updater saw it: its head, its review state,
 * GitHub's mergeability verdict, and how many base commits its head lacks.
 */
export default class PullRequestSnapshot {
  readonly number: number;
  readonly baseRefName: string;
  readonly headRefName: string;
  readonly headOid: string;
  readonly isDraft: boolean;
  readonly isFork: boolean;
  readonly mergeability: Mergeability;
  readonly behindBy: number;

  constructor(fields: PullRequestSnapshotFields) {
    requireCount(fields.number, 'number', 1);
    requireCount(fields.behindBy, 'behindBy', 0);
    requireRefName(fields.baseRefName, 'baseRefName');
    requireRefName(fields.headRefName, 'headRefName');
    requireObjectId(fields.headOid);
    this.number = fields.number;
    this.baseRefName = fields.baseRefName;
    this.headRefName = fields.headRefName;
    this.headOid = fields.headOid;
    this.isDraft = fields.isDraft;
    this.isFork = fields.isFork;
    this.mergeability = fields.mergeability;
    this.behindBy = fields.behindBy;
    Object.freeze(this);
  }
}

function requireCount(value: number, name: string, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new PrBranchUpdateError(`pull request ${name} must be an integer of at least ${minimum}, got ${value}`);
  }
}

function requireRefName(value: string, name: string): void {
  if (value.length === 0) {
    throw new PrBranchUpdateError(`pull request ${name} must not be empty`);
  }
}

function requireObjectId(value: string): void {
  if (!OBJECT_ID.test(value)) {
    throw new PrBranchUpdateError(`pull request headOid must be a 40-character hex object id, got "${value}"`);
  }
}
