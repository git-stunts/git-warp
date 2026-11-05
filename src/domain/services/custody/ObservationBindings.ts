import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';
import ObservationBudget from './ObservationBudget.ts';
import ObservationDependencyClaim from './ObservationDependencyClaim.ts';
import ObservationEvidenceBinding from './ObservationEvidenceBinding.ts';
import { isObjectId } from './ObservationObjectId.ts';
import ObservationQuestion from './ObservationQuestion.ts';
import ObservationWritePremise from './ObservationWritePremise.ts';

export type ObservationBindingsFields = {
  /** The captured cone basis tree. Its id commits to the frontier and record trie. */
  readonly basis: string;
  readonly observer: string;
  readonly question: ObservationQuestion;
  readonly purpose: string;
  readonly budget: ObservationBudget;
  readonly evidence: readonly ObservationEvidenceBinding[];
  /** Exactly which objects replay requires; retained support must match. */
  readonly dependencies: ObservationDependencyClaim;
  /** Null for a read; a write also binds what it submitted. */
  readonly writePremise: ObservationWritePremise | null;
};

const LONE_SURROGATE = /[\ud800-\udfff]/u;

/**
 * The original standpoint of one observation attempt, as its producer captured
 * it. Custody never recaptures any of it from a later graph.
 */
export default class ObservationBindings {
  readonly basis: string;
  readonly observer: string;
  readonly question: ObservationQuestion;
  readonly purpose: string;
  readonly budget: ObservationBudget;
  readonly evidence: readonly ObservationEvidenceBinding[];
  readonly dependencies: ObservationDependencyClaim;
  readonly writePremise: ObservationWritePremise | null;

  constructor(fields: ObservationBindingsFields) {
    assertStandpoint(fields);
    assertPlans(fields);
    this.basis = fields.basis;
    this.observer = fields.observer;
    this.question = fields.question;
    this.purpose = fields.purpose;
    this.budget = fields.budget;
    this.evidence = Object.freeze([...fields.evidence]);
    this.dependencies = fields.dependencies;
    this.writePremise = fields.writePremise;
    Object.freeze(this);
  }
}

function assertStandpoint(fields: ObservationBindingsFields): void {
  if (!isObjectId(fields.basis) || !isName(fields.observer) || !isName(fields.purpose)) {
    throw new ObservationCustodyError('Observation bindings need a basis tree, an observer and a purpose');
  }
}

function assertPlans(fields: ObservationBindingsFields): void {
  const checks = [
    fields.question instanceof ObservationQuestion,
    fields.budget instanceof ObservationBudget,
    isEvidenceList(fields.evidence),
    fields.dependencies instanceof ObservationDependencyClaim,
    fields.writePremise === null || fields.writePremise instanceof ObservationWritePremise,
  ];
  if (checks.includes(false)) {
    throw new ObservationCustodyError('Observation bindings hold a question, a budget, evidence, dependencies and a write premise');
  }
}

function isEvidenceList(evidence: readonly ObservationEvidenceBinding[]): boolean {
  return Array.isArray(evidence) && evidence.every((entry) => entry instanceof ObservationEvidenceBinding);
}

/** Lone surrogates cannot survive canonical encoding, so a name holding one could not stay this name. */
function isName(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && !LONE_SURROGATE.test(value);
}
