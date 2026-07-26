import type { LaneReference } from '../domain/api/Lane.ts';
import type {
  SettlementSourceExecution,
  SettlementSourceRuntime,
  SettlementSourceSnapshot,
} from '../domain/api/LaneSettlementRuntime.ts';
import SettlementPreview from '../domain/api/SettlementPreview.ts';
import SettlementReceipt from '../domain/api/SettlementReceipt.ts';
import {
  bindSettlementPlan,
  requireSettlementPlanBinding,
  type SettlementPlanBinding,
} from '../domain/api/SettlementPlanRuntime.ts';
import {
  createDerivedSettlementOutcome,
  createSettlementObstruction,
  type SettlementOutcomeFields,
} from '../domain/api/SettlementOutcomeRuntime.ts';
import SettlementPlan from '../domain/settlement/SettlementPlan.ts';
import WarpError from '../domain/errors/WarpError.ts';
import type Evidence from '../domain/api/Evidence.ts';
import {
  requireSettlementSourceRuntime,
} from './RuntimeSettlementValidation.ts';
import type { RuntimeSettlementOptions } from './RuntimeSettlementOptions.ts';

export type { RuntimeSettlementOptions } from './RuntimeSettlementOptions.ts';

const SETTLEMENT_LAW = 'git-warp:settlement-law/strand-promotion/v1';
const SETTLEMENT_POLICY = 'git-warp:settlement-policy/exact-frontier/v1';

type PreparedSettlement = Readonly<{
  readonly fields: SettlementOutcomeFields;
  readonly source: LaneReference;
  readonly sourceRuntime: SettlementSourceRuntime;
  readonly sourceSnapshot: SettlementSourceSnapshot;
  readonly target: LaneReference;
}>;

type SettlementExecutionOptions = Readonly<{
  readonly binding: SettlementPlanBinding;
  readonly execution: SettlementSourceExecution;
  readonly plan: SettlementPlan;
}>;

type SettlementReceiptFields = Readonly<{
  readonly binding: SettlementPlanBinding;
  readonly evidence: Evidence;
  readonly outcome: SettlementPlanBinding['outcome'];
  readonly plan: SettlementPlan;
}>;

type SettlementFieldOptions = Readonly<{
  readonly source: LaneReference;
  readonly sourceRuntime: SettlementSourceRuntime;
  readonly sourceSnapshot: SettlementSourceSnapshot;
  readonly target: LaneReference;
}>;

export async function previewRuntimeSettlement(
  options: RuntimeSettlementOptions,
  owner: object,
): Promise<SettlementPreview> {
  const prepared = await prepareSettlement(options, owner);
  const plan = createSettlementPlan(prepared.fields);
  const outcome = previewOutcome(prepared);
  const evidence = planEvidence(plan);
  bindSettlementPlan(plan, {
    evidence,
    outcome,
    owner,
    source: prepared.source,
    sourceRuntime: prepared.sourceRuntime,
    sourceSnapshot: prepared.sourceSnapshot,
    target: prepared.target,
  });
  return new SettlementPreview({
    evidence,
    outcome,
    plan,
    source: prepared.source,
    target: prepared.target,
  });
}

export async function settleRuntimePlan(
  plan: SettlementPlan,
  owner: object,
): Promise<SettlementReceipt> {
  const binding = requireSettlementPlanBinding(plan);
  assertSettlementPlanOwner(binding, owner);
  return await binding.sourceRuntime.runExclusive(async (execution) =>
    await executeSettlement({ binding, execution, plan })
  );
}

async function executeSettlement(
  options: SettlementExecutionOptions,
): Promise<SettlementReceipt> {
  const { binding, execution, plan } = options;
  const current = await recaptureSettlement(execution);
  if (!settlementBasisMatches(plan, binding, current)) {
    return staleReceipt(plan, binding, current);
  }
  if (binding.outcome.kind !== 'derived') {
    return settlementReceipt({
      binding,
      evidence: binding.evidence,
      outcome: binding.outcome,
      plan,
    });
  }
  return await promoteSettlement(options);
}

async function promoteSettlement(
  options: SettlementExecutionOptions,
): Promise<SettlementReceipt> {
  const { binding, execution, plan } = options;
  const promotion = await execution.promote();
  const evidence = combineEvidence(binding.evidence, promotion.evidence);
  if (promotion.accepted) {
    return settlementReceipt({
      binding,
      evidence,
      outcome: binding.outcome,
      plan,
    });
  }
  const outcome = createSettlementObstruction(outcomeFields(plan), {
    family: 'invalid-derivation',
    code: 'git-warp.settlement-promotion-failed',
    suppliedEvidenceRefs: supportIds(binding.evidence),
    requiredEvidenceRefs: [plan.planDigest],
  });
  return settlementReceipt({ binding, evidence, outcome, plan });
}

async function prepareSettlement(
  options: RuntimeSettlementOptions,
  owner: object,
): Promise<PreparedSettlement> {
  const sourceRuntime = requireSettlementSourceRuntime(options, owner);
  const sourceSnapshot = await sourceRuntime.capture();
  const source = options.source.reference;
  const target = options.target.reference;
  const fields = await createSettlementFields({
    source,
    sourceRuntime,
    sourceSnapshot,
    target,
  });
  return Object.freeze({
    fields,
    source,
    sourceRuntime,
    sourceSnapshot,
    target,
  });
}

async function createSettlementFields(
  options: SettlementFieldOptions,
): Promise<SettlementOutcomeFields> {
  const { source, sourceRuntime, sourceSnapshot, target } = options;
  const sourceLaneId = laneId(source);
  const targetLaneId = laneId(target);
  const lawDigest = await sourceRuntime.digest(['law', SETTLEMENT_LAW]);
  const policyDigest = await sourceRuntime.digest(['policy', SETTLEMENT_POLICY]);
  const planDigest = await createSettlementPlanDigest({
    lawDigest,
    policyDigest,
    sourceLaneId,
    sourceRuntime,
    sourceSnapshot,
    targetLaneId,
  });
  return Object.freeze({
    lawDigest,
    planDigest,
    policyDigest,
    proposalDigest: sourceSnapshot.proposalDigest,
    sourceFrontierRef: sourceSnapshot.frontierRef,
    sourceLaneId,
    targetFrontierRef: sourceSnapshot.targetFrontierRef,
    targetLaneId,
  });
}

async function createSettlementPlanDigest(options: Readonly<{
  readonly lawDigest: string;
  readonly policyDigest: string;
  readonly sourceLaneId: string;
  readonly sourceRuntime: SettlementSourceRuntime;
  readonly sourceSnapshot: SettlementSourceSnapshot;
  readonly targetLaneId: string;
}>): Promise<string> {
  const {
    lawDigest,
    policyDigest,
    sourceLaneId,
    sourceRuntime,
    sourceSnapshot,
    targetLaneId,
  } = options;
  return await sourceRuntime.digest([
    'plan',
    sourceLaneId,
    targetLaneId,
    sourceSnapshot.frontierRef,
    sourceSnapshot.targetFrontierRef,
    sourceSnapshot.proposalDigest,
    lawDigest,
    policyDigest,
    sourceSnapshot.status,
    settlementOutcomeKind(sourceSnapshot),
  ]);
}

function settlementOutcomeKind(
  snapshot: SettlementSourceSnapshot,
): 'derived' | 'obstruction' {
  return snapshot.status === 'ready'
      && snapshot.baseTargetFrontierRef === snapshot.targetFrontierRef
    ? 'derived'
    : 'obstruction';
}

function previewOutcome(prepared: PreparedSettlement) {
  if (prepared.sourceSnapshot.status !== 'ready') {
    return createSettlementObstruction(prepared.fields, {
      family: 'unsupported-contract',
      code: `git-warp.settlement-source-${prepared.sourceSnapshot.status}`,
      suppliedEvidenceRefs: [prepared.sourceSnapshot.frontierRef],
      requiredEvidenceRefs: [prepared.sourceSnapshot.proposalDigest],
    });
  }
  if (
    prepared.sourceSnapshot.baseTargetFrontierRef
    !== prepared.sourceSnapshot.targetFrontierRef
  ) {
    return createSettlementObstruction(prepared.fields, {
      family: 'unsupported-contract',
      code: 'git-warp.settlement-common-basis-required',
      suppliedEvidenceRefs: [prepared.sourceSnapshot.targetFrontierRef],
      requiredEvidenceRefs: [prepared.sourceSnapshot.baseTargetFrontierRef],
    });
  }
  return createDerivedSettlementOutcome(prepared.fields);
}

async function recaptureSettlement(
  execution: SettlementSourceExecution,
) {
  const [sourceSnapshot, lawDigest, policyDigest] = await Promise.all([
    execution.capture(),
    execution.digest(['law', SETTLEMENT_LAW]),
    execution.digest(['policy', SETTLEMENT_POLICY]),
  ]);
  return Object.freeze({
    lawDigest,
    policyDigest,
    sourceSnapshot,
  });
}

function settlementBasisMatches(
  plan: SettlementPlan,
  binding: SettlementPlanBinding,
  current: Awaited<ReturnType<typeof recaptureSettlement>>,
): boolean {
  return [
    [current.sourceSnapshot.frontierRef, plan.sourceFrontier.id],
    [current.sourceSnapshot.proposalDigest, plan.proposalDigest],
    [current.sourceSnapshot.status, binding.sourceSnapshot.status],
    [current.sourceSnapshot.targetFrontierRef, plan.targetFrontier.id],
    [current.lawDigest, plan.lawDigest],
    [current.policyDigest, plan.policyDigest],
  ].every(([supplied, required]) => supplied === required);
}

function staleReceipt(
  plan: SettlementPlan,
  binding: SettlementPlanBinding,
  current: Awaited<ReturnType<typeof recaptureSettlement>>,
): SettlementReceipt {
  return new SettlementReceipt({
    evidence: planEvidence(plan, [
      current.sourceSnapshot.frontierRef,
      current.sourceSnapshot.targetFrontierRef,
    ]),
    outcome: staleSettlementOutcome(plan, current),
    plan,
    repairHints: Object.freeze([{
      code: 'repreview-settlement',
      message: 'Preview settlement again against the current Lane frontiers.',
    }]),
    source: binding.source,
    target: binding.target,
  });
}

function staleSettlementOutcome(
  plan: SettlementPlan,
  current: Awaited<ReturnType<typeof recaptureSettlement>>,
): SettlementPlanBinding['outcome'] {
  return createSettlementObstruction({
    ...outcomeFields(plan),
    lawDigest: current.lawDigest,
    policyDigest: current.policyDigest,
    sourceFrontierRef: current.sourceSnapshot.frontierRef,
    targetFrontierRef: current.sourceSnapshot.targetFrontierRef,
  }, {
    family: 'stale-basis',
    code: 'git-warp.settlement-stale-basis',
    suppliedEvidenceRefs: currentSettlementBasisRefs(current),
    requiredEvidenceRefs: planSettlementBasisRefs(plan),
  });
}

function currentSettlementBasisRefs(
  current: Awaited<ReturnType<typeof recaptureSettlement>>,
): readonly string[] {
  return [
    current.sourceSnapshot.frontierRef,
    current.sourceSnapshot.targetFrontierRef,
    current.sourceSnapshot.proposalDigest,
    current.lawDigest,
    current.policyDigest,
  ];
}

function planSettlementBasisRefs(plan: SettlementPlan): readonly string[] {
  return [
    plan.sourceFrontier.id,
    plan.targetFrontier.id,
    plan.proposalDigest,
    plan.lawDigest,
    plan.policyDigest,
  ];
}

function settlementReceipt(
  options: SettlementReceiptFields,
): SettlementReceipt {
  const { binding, evidence, outcome, plan } = options;
  return new SettlementReceipt({
    evidence,
    outcome,
    plan,
    source: binding.source,
    target: binding.target,
  });
}

function planEvidence(
  plan: SettlementPlan,
  additionalSupport: readonly string[] = [],
): Evidence {
  return Object.freeze({
    basis: plan.targetFrontier,
    support: Object.freeze([
      plan.sourceFrontier.id,
      plan.proposalDigest,
      plan.lawDigest,
      plan.policyDigest,
      plan.planDigest,
      ...additionalSupport,
    ].map((id) => Object.freeze({ id }))),
  });
}

function combineEvidence(
  plan: Evidence,
  promotion: Evidence | undefined,
): Evidence {
  if (promotion === undefined) {
    return plan;
  }
  return Object.freeze({
    basis: plan.basis,
    support: Object.freeze([
      ...plan.support,
      promotion.basis,
      ...promotion.support,
    ]),
  });
}

function supportIds(evidence: Evidence): readonly string[] {
  return [evidence.basis.id, ...evidence.support.map(({ id }) => id)];
}

function outcomeFields(plan: SettlementPlan): SettlementOutcomeFields {
  return Object.freeze({
    planDigest: plan.planDigest,
    sourceLaneId: plan.sourceLaneId,
    targetLaneId: plan.targetLaneId,
    sourceFrontierRef: plan.sourceFrontier.id,
    targetFrontierRef: plan.targetFrontier.id,
    proposalDigest: plan.proposalDigest,
    lawDigest: plan.lawDigest,
    policyDigest: plan.policyDigest,
  });
}

function createSettlementPlan(
  fields: SettlementOutcomeFields,
): SettlementPlan {
  return new SettlementPlan({
    lawDigest: fields.lawDigest,
    planDigest: fields.planDigest,
    policyDigest: fields.policyDigest,
    proposalDigest: fields.proposalDigest,
    sourceFrontier: Object.freeze({ id: fields.sourceFrontierRef }),
    sourceLaneId: fields.sourceLaneId,
    targetFrontier: Object.freeze({ id: fields.targetFrontierRef }),
    targetLaneId: fields.targetLaneId,
  });
}

function assertSettlementPlanOwner(
  binding: SettlementPlanBinding,
  owner: object,
): void {
  if (binding.owner !== owner) {
    throw new WarpError(
      'Runtime.settle requires a plan issued by this Runtime',
      'E_RUNTIME_SETTLEMENT_FOREIGN_PLAN',
    );
  }
}

function laneId(reference: LaneReference): string {
  return `${reference.kind}:${reference.name}`;
}
