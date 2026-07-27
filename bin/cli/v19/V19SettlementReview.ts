import { z } from 'zod';

import type Runtime from '../../../src/application/Runtime.ts';
import type SettlementPreview from '../../../src/domain/api/SettlementPreview.ts';
import type SettlementReceipt from '../../../src/domain/api/SettlementReceipt.ts';
import type SettlementPlan from '../../../src/domain/settlement/SettlementPlan.ts';
import type { SettlementPlanFields } from '../../../src/domain/settlement/SettlementPlan.ts';
import WarpError from '../../../src/domain/errors/WarpError.ts';
import type { McpJsonValue } from '../commands/mcp/McpJsonValue.ts';
import { usageErrorFrom } from '../infrastructure.ts';

export type SettlementSelector = Readonly<{
  readonly sourceLane: string;
  readonly sourceStrand: string;
  readonly targetLane: string;
}>;

export type ReviewedSettlement = Readonly<{
  readonly selector: SettlementSelector;
  readonly plan: ReviewedSettlementPlanFields;
}>;

export type ReviewedSettlementPlanFields = SettlementPlanFields & Readonly<{
  readonly invalidationRule: 'any-bound-input-change';
}>;

const SELECTOR_SCHEMA = z.object({
  sourceLane: z.string().min(1),
  sourceStrand: z.string().min(1),
  targetLane: z.string().min(1),
}).strict();

const PLAN_SCHEMA = z.object({
  invalidationRule: z.literal('any-bound-input-change'),
  planDigest: z.string().min(1),
  sourceLaneId: z.string().min(1),
  targetLaneId: z.string().min(1),
  sourceFrontier: z.object({ id: z.string().min(1) }).strict(),
  targetFrontier: z.object({ id: z.string().min(1) }).strict(),
  proposalDigest: z.string().min(1),
  lawDigest: z.string().min(1),
  policyDigest: z.string().min(1),
}).strict();

const REVIEW_SCHEMA = z.object({
  selector: SELECTOR_SCHEMA,
  plan: PLAN_SCHEMA,
}).passthrough();

export async function previewReviewedSettlement(
  runtime: Runtime,
  selector: SettlementSelector,
): Promise<SettlementPreview> {
  const sourceParent = await runtime.lane(selector.sourceLane);
  const target = selector.sourceLane === selector.targetLane
    ? sourceParent
    : await runtime.lane(selector.targetLane);
  const source = await runtime.strand(sourceParent, {
    name: selector.sourceStrand,
  });
  return await runtime.previewSettlement({ source, target });
}

export function reviewSettlement(
  selector: SettlementSelector,
  plan: SettlementPlan,
): ReviewedSettlement {
  return Object.freeze({
    selector: freezeSelector(selector),
    plan: settlementPlanFields(plan),
  });
}

export function reviewedSettlementFromValue(
  value: McpJsonValue,
): ReviewedSettlement {
  let reviewed: z.infer<typeof REVIEW_SCHEMA>;
  try {
    reviewed = REVIEW_SCHEMA.parse(value);
  } catch (error) {
    throw usageErrorFrom('Invalid reviewed Settlement', error);
  }
  return Object.freeze({
    selector: freezeSelector(reviewed.selector),
    plan: freezePlanFields(reviewed.plan),
  });
}

export async function applyReviewedSettlement(
  runtime: Runtime,
  reviewed: ReviewedSettlement,
): Promise<SettlementReceipt> {
  const current = await previewReviewedSettlement(runtime, reviewed.selector);
  if (!plansEqual(reviewed.plan, current.plan)) {
    throw new WarpError(
      'Reviewed Settlement plan no longer matches the current Runtime preview',
      'E_RUNTIME_SETTLEMENT_REVIEW_MISMATCH',
    );
  }
  return await runtime.settle(current.plan);
}

function freezeSelector(selector: SettlementSelector): SettlementSelector {
  return Object.freeze({
    sourceLane: selector.sourceLane,
    sourceStrand: selector.sourceStrand,
    targetLane: selector.targetLane,
  });
}

export function settlementPlanFields(
  plan: SettlementPlan,
): ReviewedSettlementPlanFields {
  return freezePlanFields(plan);
}

function freezePlanFields(
  plan: ReviewedSettlementPlanFields,
): ReviewedSettlementPlanFields {
  return Object.freeze({
    invalidationRule: plan.invalidationRule,
    planDigest: plan.planDigest,
    sourceLaneId: plan.sourceLaneId,
    targetLaneId: plan.targetLaneId,
    sourceFrontier: Object.freeze({ id: plan.sourceFrontier.id }),
    targetFrontier: Object.freeze({ id: plan.targetFrontier.id }),
    proposalDigest: plan.proposalDigest,
    lawDigest: plan.lawDigest,
    policyDigest: plan.policyDigest,
  });
}

function plansEqual(
  reviewed: ReviewedSettlementPlanFields,
  current: SettlementPlan,
): boolean {
  const reviewedParts = planParts(reviewed);
  const currentParts = planParts(current);
  return reviewedParts.every(
    (part, index) => part === currentParts[index],
  );
}

function planParts(plan: ReviewedSettlementPlanFields): readonly string[] {
  return [
    plan.invalidationRule,
    plan.planDigest,
    plan.sourceLaneId,
    plan.targetLaneId,
    plan.sourceFrontier.id,
    plan.targetFrontier.id,
    plan.proposalDigest,
    plan.lawDigest,
    plan.policyDigest,
  ];
}
