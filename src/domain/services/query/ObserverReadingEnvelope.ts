import QueryError from '../../errors/QueryError.ts';
import {
  GIT_WARP_RECEIPT_ENVELOPE_BOUNDARY_VERSION,
  GIT_WARP_RECEIPT_ENVELOPE_FACT_KIND,
  type GitWarpReceiptEnvelopeAnchor,
} from '../../continuum/GitWarpReceiptEnvelopeBoundary.ts';
import ObserverEmission from './ObserverEmission.ts';
import ObserverPlan from './ObserverPlan.ts';
import type { WorldlineSource } from '../../capabilities/QueryCapability.ts';

export type ObserverReadingEnvelopeBudget = {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly propertyKeyCount: number;
  readonly matchedBasisCount: number;
};

export type ObserverReadingEnvelopeFields = {
  readonly plan: ObserverPlan;
  readonly payload: ObserverEmission;
  readonly stateHash?: string | null;
  readonly witnessRef?: string | null;
  readonly shellRef?: string | null;
  readonly pluralityRef?: string | null;
  readonly receiptAnchors?: readonly GitWarpReceiptEnvelopeAnchor[];
};

type ObserverReadingEnvelopeRefs = {
  readonly stateHash: string | null;
  readonly witnessRef: string | null;
  readonly shellRef: string | null;
  readonly pluralityRef: string | null;
};

/** Observer reading envelope tying source plan, emitted payload, and witness refs. */
export default class ObserverReadingEnvelope {
  readonly plan: ObserverPlan;
  readonly payload: ObserverEmission;
  readonly stateHash: string | null;
  readonly witnessRef: string | null;
  readonly shellRef: string | null;
  readonly pluralityRef: string | null;
  readonly receiptAnchors: readonly GitWarpReceiptEnvelopeAnchor[];
  readonly budget: ObserverReadingEnvelopeBudget;
  readonly residualBasis: readonly string[];

  constructor(fields: ObserverReadingEnvelopeFields) {
    const checkedFields = requireFields(fields);
    const refs = requireEnvelopeRefs(checkedFields);
    this.plan = requirePlan(checkedFields.plan);
    this.payload = requirePayload(checkedFields.payload);
    this.stateHash = refs.stateHash;
    this.witnessRef = refs.witnessRef;
    this.shellRef = refs.shellRef;
    this.pluralityRef = refs.pluralityRef;
    this.receiptAnchors = freezeReceiptAnchors(checkedFields.receiptAnchors ?? []);
    this.budget = freezeBudget(this.payload);
    this.residualBasis = freezeResidualBasis(this.plan, this.payload);
    Object.freeze(this);
  }

  get source(): WorldlineSource {
    return this.plan.source;
  }

  hasResidual(): boolean {
    return this.residualBasis.length > 0;
  }

  hasPlurality(): boolean {
    return this.pluralityRef !== null;
  }

  hasReceiptAnchors(): boolean {
    return this.receiptAnchors.length > 0;
  }
}

function requireFields(
  fields: ObserverReadingEnvelopeFields | null | undefined,
): ObserverReadingEnvelopeFields {
  if (fields !== null && typeof fields === 'object') {
    return fields;
  }
  throw new QueryError('observer reading envelope requires object fields', {
    code: 'E_OBSERVER_READING_ENVELOPE_FIELDS',
  });
}

function requirePlan(plan: ObserverPlan): ObserverPlan {
  if (plan instanceof ObserverPlan) {
    return plan;
  }
  throw new QueryError('observer reading envelope requires an ObserverPlan', {
    code: 'E_OBSERVER_READING_ENVELOPE_PLAN',
  });
}

function requirePayload(payload: ObserverEmission): ObserverEmission {
  if (payload instanceof ObserverEmission) {
    return payload;
  }
  throw new QueryError('observer reading envelope requires an ObserverEmission payload', {
    code: 'E_OBSERVER_READING_ENVELOPE_PAYLOAD',
  });
}

function requireEnvelopeRefs(fields: ObserverReadingEnvelopeFields): ObserverReadingEnvelopeRefs {
  return {
    stateHash: requireOptionalRef(fields.stateHash ?? null, 'stateHash'),
    witnessRef: requireOptionalRef(fields.witnessRef ?? null, 'witnessRef'),
    shellRef: requireOptionalRef(fields.shellRef ?? null, 'shellRef'),
    pluralityRef: requireOptionalRef(fields.pluralityRef ?? null, 'pluralityRef'),
  };
}

function requireOptionalRef(value: string | null, field: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  throw new QueryError('observer reading envelope refs must be non-empty when provided', {
    code: 'E_OBSERVER_READING_ENVELOPE_REF',
    context: { field },
  });
}

function freezeBudget(payload: ObserverEmission): ObserverReadingEnvelopeBudget {
  return Object.freeze({
    nodeCount: payload.nodeCount,
    edgeCount: payload.edgeCount,
    propertyKeyCount: payload.propertyKeys.length,
    matchedBasisCount: payload.matchedBasis.length,
  });
}

function freezeResidualBasis(
  plan: ObserverPlan,
  payload: ObserverEmission,
): readonly string[] {
  const matched = new Set(payload.matchedBasis);
  return Object.freeze(plan.basis.distinctions.filter((distinction) => !matched.has(distinction)));
}

function freezeReceiptAnchors(
  anchors: readonly GitWarpReceiptEnvelopeAnchor[],
): readonly GitWarpReceiptEnvelopeAnchor[] {
  if (!Array.isArray(anchors)) {
    throw new QueryError('observer reading envelope receipt anchors must be an array', {
      code: 'E_OBSERVER_READING_ENVELOPE_RECEIPTS',
    });
  }
  return Object.freeze(anchors.map(requireReceiptAnchor));
}

function requireReceiptAnchor(anchor: GitWarpReceiptEnvelopeAnchor): GitWarpReceiptEnvelopeAnchor {
  requireReceiptAnchorBoundary(anchor);
  requireReceiptAnchorFields(anchor);
  return freezeReceiptAnchor(anchor);
}

function requireReceiptAnchorBoundary(anchor: GitWarpReceiptEnvelopeAnchor): void {
  if (anchor.boundaryVersion === GIT_WARP_RECEIPT_ENVELOPE_BOUNDARY_VERSION
    && anchor.substrateFactKind === GIT_WARP_RECEIPT_ENVELOPE_FACT_KIND) {
    return;
  }
  throw new QueryError('observer reading envelope receipt anchor has an unsupported boundary', {
    code: 'E_OBSERVER_READING_ENVELOPE_RECEIPT_BOUNDARY',
  });
}

function requireReceiptAnchorFields(anchor: GitWarpReceiptEnvelopeAnchor): void {
  requireNonEmptyString(anchor.patchSha, 'patchSha');
  requireNonEmptyString(anchor.writer, 'writer');
  requireNonNegativeInteger(anchor.lamport, 'lamport');
  requireNonNegativeInteger(anchor.outcomeCount, 'outcomeCount');
  requireNonNegativeInteger(anchor.appliedCount, 'appliedCount');
  requireNonNegativeInteger(anchor.supersededCount, 'supersededCount');
  requireNonNegativeInteger(anchor.redundantCount, 'redundantCount');
  if (typeof anchor.hasExplanatoryReasons !== 'boolean') {
    throw new QueryError('observer reading envelope receipt anchor reason flag must be boolean', {
      code: 'E_OBSERVER_READING_ENVELOPE_RECEIPT_FLAG',
      context: { field: 'hasExplanatoryReasons' },
    });
  }
}

function freezeReceiptAnchor(anchor: GitWarpReceiptEnvelopeAnchor): GitWarpReceiptEnvelopeAnchor {
  return Object.freeze({
    boundaryVersion: anchor.boundaryVersion,
    substrateFactKind: anchor.substrateFactKind,
    patchSha: anchor.patchSha,
    writer: anchor.writer,
    lamport: anchor.lamport,
    outcomeCount: anchor.outcomeCount,
    appliedCount: anchor.appliedCount,
    supersededCount: anchor.supersededCount,
    redundantCount: anchor.redundantCount,
    hasExplanatoryReasons: anchor.hasExplanatoryReasons,
  });
}

function requireNonEmptyString(value: string, field: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new QueryError('observer reading envelope receipt anchor fields must be non-empty strings', {
      code: 'E_OBSERVER_READING_ENVELOPE_RECEIPT_STRING',
      context: { field },
    });
  }
}

function requireNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new QueryError('observer reading envelope receipt anchor counts must be non-negative integers', {
      code: 'E_OBSERVER_READING_ENVELOPE_RECEIPT_COUNT',
      context: { field },
    });
  }
}
