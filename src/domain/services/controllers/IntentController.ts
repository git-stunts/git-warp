/**
 * IntentController — encapsulates unmaterialized intent admission operations.
 *
 * @module domain/services/controllers/IntentController
 */

import type IntentCapability from '../../capabilities/IntentCapability.ts';
import AdmissionObstructionReason from '../../admission/AdmissionObstructionReason.ts';
import AdmissionRetryDisposition from '../../admission/AdmissionRetryDisposition.ts';
import type { IntentAdmissionReceipt } from '../../admission/IntentAdmissionReceipt.ts';
import ObstructedIntentAdmissionReceipt from '../../admission/ObstructedIntentAdmissionReceipt.ts';
import QueryError from '../../errors/QueryError.ts';
import WarpError from '../../errors/WarpError.ts';
import type {
  PrecommitGuard,
  WarpIntentDescriptor,
} from '../../types/WarpIntentDescriptor.ts';
import type { PropValue } from '../../types/PropValue.ts';
import { canonicalStringify } from '../../utils/canonicalStringify.ts';
import type IntentStorePort from '../../../ports/IntentStorePort.ts';
import {
  type default as BoundedIntentGuardReader,
  boundedIntentGuardEvidenceRef,
  captureBoundedIntentGuardReader,
  type BoundedIntentGuardReading,
  type BoundedIntentGuardSource,
} from '../admission/BoundedIntentGuardReader.ts';
import {
  createDerivedIntentAdmissionReceipt,
  createObstructedIntentAdmissionReceipt,
  type IntentAdmissionIdentity,
} from '../admission/IntentAdmissionReceiptFactory.ts';

export type IntentHost = BoundedIntentGuardSource & {
  _writerId: string;
  _intentStore: IntentStorePort;
};

type IntentObstruction = {
  readonly tag: string;
  readonly nodeId: string;
  readonly actual: string;
};
type StatusGuard = Extract<PrecommitGuard, { readonly op: 'nodeStatus' }>;
type AgentGuard = Extract<PrecommitGuard, { readonly op: 'nodeUnassignedOrSelf' }>;
type GuardReadObstruction = {
  readonly reason: AdmissionObstructionReason;
  readonly suppliedEvidenceRefs: readonly string[];
  readonly requiredEvidenceRefs: readonly string[];
  readonly failedConditionRef: string;
};
type GuardReadContext = {
  readonly identity: IntentAdmissionIdentity;
  readonly destinationBasisRef: string;
  readonly evaluationCoordinateRef: string;
};
type GuardEvaluation = Readonly<{
  readonly obstruction: ObstructedIntentAdmissionReceipt | null;
  readonly evaluationCoordinateRef: string;
}>;

export default class IntentController implements IntentCapability {
  _host: IntentHost;
  constructor(host: IntentHost) {
    this._host = host;
  }

  async admitIntent(descriptor: WarpIntentDescriptor): Promise<IntentAdmissionReceipt> {
    const identity = this._identity(descriptor, 'admitted', this._host._writerId);
    const destinationBasisRef = await this._getIntentAdmissionBasis();
    const guardResult = await this._evaluateGuards(identity, destinationBasisRef);
    if (guardResult.obstruction !== null) {
      return guardResult.obstruction;
    }
    const published = await this._host._intentStore.publish({
      graphName: this._host._graphName,
      channel: 'admitted',
      ownerId: this._host._writerId,
      descriptor,
    });
    return createDerivedIntentAdmissionReceipt(
      identity,
      published,
      guardResult.evaluationCoordinateRef,
    );
  }

  private async _evaluateGuards(
    identity: IntentAdmissionIdentity,
    destinationBasisRef: string,
  ): Promise<GuardEvaluation> {
    if (identity.descriptor.precommitGuards.length === 0) {
      return createGuardEvaluation(null, destinationBasisRef);
    }
    const guardReader = await captureBoundedIntentGuardReader(this._host);
    const context = {
      identity,
      destinationBasisRef,
      evaluationCoordinateRef: guardReader.evaluationCoordinateRef,
    };
    for (const guard of identity.descriptor.precommitGuards) {
      const obstruction = await this._evaluateGuard(guardReader, guard, context);
      if (obstruction !== null) {
        return createGuardEvaluation(obstruction, context.evaluationCoordinateRef);
      }
    }
    return createGuardEvaluation(null, context.evaluationCoordinateRef);
  }

  private async _evaluateGuard(
    reader: BoundedIntentGuardReader,
    guard: PrecommitGuard,
    context: GuardReadContext,
  ): Promise<ObstructedIntentAdmissionReceipt | null> {
    const reading = await this._readGuard(reader, guard, context);
    if (reading instanceof ObstructedIntentAdmissionReceipt) {
      return reading;
    }
    const obstruction = this._checkGuard(guard, reading.value);
    if (obstruction === null) {
      return null;
    }
    return createObstructedIntentAdmissionReceipt(context.identity, {
      destinationBasisRef: context.destinationBasisRef,
      evaluationCoordinateRef: context.evaluationCoordinateRef,
      reason: AdmissionObstructionReason.lawViolation('git-warp.intent-guard'),
      suppliedEvidenceRefs: [
        guardActualEvidenceRef(obstruction),
        boundedIntentGuardEvidenceRef(reading.readIdentity),
      ],
      requiredEvidenceRefs: [guardRequiredEvidenceRef(guard)],
      failedConditionRef: guardConditionRef(obstruction),
      retry: AdmissionRetryDisposition.afterChange(),
    });
  }

  private async _readGuard(
    reader: BoundedIntentGuardReader,
    guard: PrecommitGuard,
    context: GuardReadContext,
  ): Promise<BoundedIntentGuardReading | ObstructedIntentAdmissionReceipt> {
    try {
      return await reader.read(guard);
    } catch (error) {
      if (!(error instanceof QueryError)) {
        throw error;
      }
      const readObstruction = guardReadObstruction(error);
      if (readObstruction === null) {
        throw error;
      }
      return createObstructedIntentAdmissionReceipt(context.identity, {
        destinationBasisRef: context.destinationBasisRef,
        evaluationCoordinateRef: context.evaluationCoordinateRef,
        ...readObstruction,
        retry: AdmissionRetryDisposition.afterChange(),
      });
    }
  }

  private _checkGuard(
    guard: PrecommitGuard,
    value: PropValue | undefined,
  ): IntentObstruction | null {
    if (guard.op === 'nodeStatus') {
      return this._checkStatusGuard(guard, value);
    }
    if (guard.op === 'nodeUnassignedOrSelf') {
      return this._checkAgentGuard(guard, value);
    }
    const unsupported: never = guard;
    throw new WarpError(
      `Unsupported precommit guard: ${String((unsupported as { op?: string }).op)}`,
      'E_VALIDATION'
    );
  }

  private _checkStatusGuard(
    guard: StatusGuard,
    value: PropValue | undefined,
  ): IntentObstruction | null {
    const actualStatus = value === undefined
      ? 'ABSENT'
      : typeof value === 'string'
        ? value
        : canonicalStringify(value);
    if (actualStatus !== guard.expected) {
      return { tag: guard.failureTag, nodeId: guard.nodeId, actual: actualStatus };
    }
    return null;
  }

  private _checkAgentGuard(
    guard: AgentGuard,
    value: PropValue | undefined,
  ): IntentObstruction | null {
    if (value === undefined || value === null || value === guard.agentId) {
      return null;
    }
    const actual = typeof value === 'string' ? value : canonicalStringify(value);
    return { tag: guard.failureTag, nodeId: guard.nodeId, actual };
  }

  async queueIntent(
    strandId: string,
    descriptor: WarpIntentDescriptor,
  ): Promise<IntentAdmissionReceipt> {
    const identity = this._identity(descriptor, 'queued', strandId);
    const published = await this._host._intentStore.publish({
      graphName: this._host._graphName,
      channel: 'queued',
      ownerId: strandId,
      descriptor,
    });
    return createDerivedIntentAdmissionReceipt(identity, published, published.basisRef);
  }

  private async _getIntentAdmissionBasis(): Promise<string> {
    return await this._host._intentStore.currentBasisRef(
      this._host._graphName,
      'admitted',
      this._host._writerId,
    );
  }

  async getWriterIntents(writerId: string): Promise<WarpIntentDescriptor[]> {
    return await this._host._intentStore
      .scan(this._host._graphName, 'queued', writerId)
      .collect();
  }

  private _identity(
    descriptor: WarpIntentDescriptor,
    channel: 'admitted' | 'queued',
    ownerId: string,
  ): IntentAdmissionIdentity {
    return {
      descriptor,
      graphName: this._host._graphName,
      writerId: this._host._writerId,
      channel,
      ownerId,
    };
  }
}

function guardReadObstruction(error: QueryError): GuardReadObstruction | null {
  if (error.code === 'E_OPTIC_NO_BOUNDED_BASIS') {
    return {
      reason: AdmissionObstructionReason.unsupportedEvidence(
        'git-warp.missing-bounded-basis'
      ),
      suppliedEvidenceRefs: [`warp:optic-failure/${error.code}`],
      requiredEvidenceRefs: ['warp:bounded-basis/checkpoint-tail'],
      failedConditionRef: 'warp:condition/bounded-intent-guard-basis',
    };
  }
  if (error.code === 'E_OPTIC_TAIL_BUDGET_EXCEEDED') {
    return {
      reason: AdmissionObstructionReason.budgetExceeded(
        'git-warp.bounded-read-budget-exceeded'
      ),
      suppliedEvidenceRefs: [`warp:optic-failure/${error.code}`],
      requiredEvidenceRefs: ['warp:bounded-read-budget/within-limit'],
      failedConditionRef: 'warp:condition/bounded-intent-guard-budget',
    };
  }
  return null;
}

function createGuardEvaluation(
  obstruction: ObstructedIntentAdmissionReceipt | null,
  evaluationCoordinateRef: string,
): GuardEvaluation {
  return Object.freeze({ obstruction, evaluationCoordinateRef });
}

function guardActualEvidenceRef(obstruction: IntentObstruction): string {
  return `warp:intent-guard:actual/${encodeURIComponent(obstruction.nodeId)}/${
    encodeURIComponent(obstruction.actual)
  }`;
}

function guardRequiredEvidenceRef(guard: PrecommitGuard): string {
  const required = guard.op === 'nodeStatus' ? guard.expected : guard.agentId;
  return `warp:intent-guard:required/${encodeURIComponent(guard.nodeId)}/${
    encodeURIComponent(required)
  }`;
}

function guardConditionRef(obstruction: IntentObstruction): string {
  return `warp:intent-guard:condition/${encodeURIComponent(obstruction.tag)}/${
    encodeURIComponent(obstruction.nodeId)
  }`;
}
