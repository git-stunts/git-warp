import type WarpWorldline from '../WarpWorldline.ts';
import WarpError from '../errors/WarpError.ts';
import type ReadIdentity from '../services/optic/ReadIdentity.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import type { ApiRuntimeContext, OpaqueIdPart } from './ApiRuntimeContext.ts';
import type Evidence from './Evidence.ts';
import type { EvidenceHandle } from './Evidence.ts';
import Tick from './Tick.ts';

type JoinEvidenceFields = {
  readonly draft: string;
  readonly mode: 'preview' | 'join';
  readonly patchShas: readonly string[];
};

const WRITE_EVIDENCE = 'write';
const JOIN_EVIDENCE = 'join';
const READ_EVIDENCE = 'read';
const PATCH_SUPPORT = 'patch';
const INDEX_SUPPORT = 'index';
const RECOVERY_EVIDENCE = 'recovery';
const recoverySequences = new WeakMap<ApiRuntimeContext, number>();

export async function createWriteEvidence(
  runtime: WarpWorldline,
  context: ApiRuntimeContext,
  patchSha: string
): Promise<Evidence> {
  return freezeCreatedEvidence({
    basis: await createHandle(context, [
      WRITE_EVIDENCE,
      runtime.worldlineName,
      runtime.writerId,
      patchSha,
    ]),
    support: [await createHandle(context, [PATCH_SUPPORT, patchSha])],
  });
}

export async function createWriteRecoveryEvidence(
  runtime: WarpWorldline,
  context: ApiRuntimeContext
): Promise<Evidence> {
  return await createRecoveryEvidence(runtime, context, [WRITE_EVIDENCE]);
}

export async function createJoinEvidence(
  runtime: WarpWorldline,
  context: ApiRuntimeContext,
  fields: JoinEvidenceFields
): Promise<Evidence> {
  const support = await Promise.all(
    fields.patchShas.map(async (patchSha) => await createHandle(context, [PATCH_SUPPORT, patchSha]))
  );
  return freezeCreatedEvidence({
    basis: await createHandle(context, [
      JOIN_EVIDENCE,
      runtime.worldlineName,
      runtime.writerId,
      fields.draft,
      fields.mode,
      ...fields.patchShas,
    ]),
    support,
  });
}

export async function createJoinRecoveryEvidence(
  runtime: WarpWorldline,
  context: ApiRuntimeContext,
  fields: Pick<JoinEvidenceFields, 'draft' | 'mode'>
): Promise<Evidence> {
  return await createRecoveryEvidence(runtime, context, [JOIN_EVIDENCE, fields.draft, fields.mode]);
}

export async function createReadEvidence(
  context: ApiRuntimeContext,
  identity: ReadIdentity,
  tick?: Tick
): Promise<Evidence> {
  const support = await createReadSupport(context, identity);
  const frontier = identity.checkpointFrontier.flatMap((entry) => [entry.writerId, entry.patchSha]);
  const evidence = {
    basis: await createHandle(context, [
      READ_EVIDENCE,
      identity.kind,
      identity.basis,
      identity.worldline,
      identity.entityAspect,
      identity.checkpointSha,
      identity.reducerVersion,
      identity.projectionVersion,
      ...frontier,
    ]),
    support,
  };
  return freezeCreatedEvidence(tick === undefined ? evidence : { ...evidence, tick });
}

export function freezeEvidence(evidence: Evidence, field: string): Evidence {
  assertEvidenceObject(evidence, field);
  const basis = freezeHandle(evidence.basis, `${field}.basis`);
  const support = freezeSupport(evidence.support, `${field}.support`);
  const tick = validateTick(evidence.tick, `${field}.tick`);
  return freezeCreatedEvidence(tick === undefined ? { basis, support } : { basis, support, tick });
}

export function freezeOptionalEvidence(
  evidence: Evidence | undefined,
  field: string
): Evidence | undefined {
  return evidence === undefined ? undefined : freezeEvidence(evidence, field);
}

async function createReadSupport(
  context: ApiRuntimeContext,
  identity: ReadIdentity
): Promise<readonly EvidenceHandle[]> {
  return await Promise.all([
    ...identity.checkpointIndexShards.map(
      async (shard) => await createHandle(context, [INDEX_SUPPORT, shard.path, shard.oid])
    ),
    ...identity.tailWitnesses.map(
      async (witness) => await createHandle(context, [PATCH_SUPPORT, witness.sha])
    ),
  ]);
}

async function createRecoveryEvidence(
  runtime: WarpWorldline,
  context: ApiRuntimeContext,
  parts: readonly OpaqueIdPart[]
): Promise<Evidence> {
  return freezeCreatedEvidence({
    basis: await createHandle(context, [
      RECOVERY_EVIDENCE,
      runtime.worldlineName,
      runtime.writerId,
      ...parts,
      nextRecoverySequence(context),
    ]),
    support: [],
  });
}

function nextRecoverySequence(context: ApiRuntimeContext): number {
  const sequence = (recoverySequences.get(context) ?? 0) + 1;
  recoverySequences.set(context, sequence);
  return sequence;
}

function assertEvidenceObject(evidence: Evidence, field: string): void {
  if (typeof evidence !== 'object' || evidence === null) {
    throw new WarpError(`${field} must be causal evidence`, 'E_RECEIPT_EVIDENCE');
  }
}

function freezeSupport(
  support: readonly EvidenceHandle[],
  field: string
): readonly EvidenceHandle[] {
  if (!Array.isArray(support)) {
    throw new WarpError(`${field} must be an array`, 'E_RECEIPT_EVIDENCE');
  }
  return Object.freeze(support.map((handle, index) => freezeHandle(handle, `${field}[${index}]`)));
}

function validateTick(tick: Tick | undefined, field: string): Tick | undefined {
  if (tick !== undefined && !(tick instanceof Tick)) {
    throw new WarpError(`${field} must be a Tick`, 'E_RECEIPT_EVIDENCE');
  }
  return tick;
}

async function createHandle(
  context: ApiRuntimeContext,
  parts: readonly OpaqueIdPart[]
): Promise<EvidenceHandle> {
  const id = await context.createOpaqueId('evidence', parts);
  return Object.freeze({ id });
}

function freezeHandle(handle: EvidenceHandle, field: string): EvidenceHandle {
  if (typeof handle !== 'object' || handle === null) {
    throw new WarpError(`${field} must be an evidence handle`, 'E_RECEIPT_EVIDENCE');
  }
  requireNonEmptyString(handle.id, `${field}.id`);
  return Object.freeze({ id: handle.id });
}

function freezeCreatedEvidence(evidence: Evidence): Evidence {
  const result: {
    readonly basis: EvidenceHandle;
    readonly support: readonly EvidenceHandle[];
    tick?: Tick;
  } = {
    basis: evidence.basis,
    support: Object.freeze([...evidence.support]),
  };
  if (evidence.tick !== undefined) {
    result.tick = evidence.tick;
  }
  return Object.freeze(result);
}
