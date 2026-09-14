import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import type Evidence from './Evidence.ts';
import { freezeEvidence } from './EvidenceRuntime.ts';
import type { LaneReference } from './Lane.ts';

type EntityAdmissionInventoryCertificateOptions = Readonly<{
  admissionCount: number;
  basisId: string;
  causalDomainId: string;
  evidence: Evidence;
  lane: LaneReference;
  selectorDigest: string;
  streamDigest: string;
}>;

type EntityAdmissionInventoryOrdering = Readonly<{
  semantics: 'deterministic-non-causal';
  direction: 'descending';
}>;

type EntityAdmissionInventorySelector = Readonly<{
  kind: 'lane';
}>;

type EntityAdmissionInventoryLane = Readonly<{
  kind: 'worldline';
  name: string;
}>;

export const ENTITY_ADMISSION_INVENTORY_SCHEMA:
  'warp/entity-admission-inventory@1' = 'warp/entity-admission-inventory@1';
const ENTITY_ADMISSION_INVENTORY_COMPLETENESS: 'complete' = 'complete';
const ENTITY_ADMISSION_INVENTORY_COVERED_DOMAIN:
  'retained-entity-add-admissions' = 'retained-entity-add-admissions';
const ENTITY_ADMISSION_INVENTORY_ORDERING: EntityAdmissionInventoryOrdering =
  Object.freeze({
    semantics: 'deterministic-non-causal',
    direction: 'descending',
  });
const ENTITY_ADMISSION_INVENTORY_SELECTOR: EntityAdmissionInventorySelector =
  Object.freeze({ kind: 'lane' });

/** Terminal proof that one exact-basis admission inventory was fully consumed. */
export default class EntityAdmissionInventoryCertificate {
  readonly schema: typeof ENTITY_ADMISSION_INVENTORY_SCHEMA =
    ENTITY_ADMISSION_INVENTORY_SCHEMA;
  readonly admissionCount: number;
  readonly basis: Readonly<{ readonly id: string }>;
  readonly causalDomain: Readonly<{ readonly id: string }>;
  readonly completeness: 'complete' = ENTITY_ADMISSION_INVENTORY_COMPLETENESS;
  readonly coveredDomain: 'retained-entity-add-admissions' =
    ENTITY_ADMISSION_INVENTORY_COVERED_DOMAIN;
  readonly evidence: Evidence;
  readonly lane: EntityAdmissionInventoryLane;
  readonly ordering: EntityAdmissionInventoryOrdering =
    ENTITY_ADMISSION_INVENTORY_ORDERING;
  readonly selector: EntityAdmissionInventorySelector =
    ENTITY_ADMISSION_INVENTORY_SELECTOR;
  readonly selectorDigest: string;
  readonly streamDigest: string;

  constructor(
    options: EntityAdmissionInventoryCertificateOptions | null | undefined,
  ) {
    if (options === null || options === undefined) {
      throw new WarpError(
        'Entity admission inventory certificate options are required',
        'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE',
      );
    }
    if (!Number.isSafeInteger(options.admissionCount) || options.admissionCount < 0) {
      throw new WarpError(
        'Entity admission inventory count must be a non-negative safe integer',
        'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE',
      );
    }
    const basisId = requireCertificateId(options.basisId, 'basis');
    const evidence = freezeEvidence(options.evidence, 'entityAdmissionInventory.evidence');
    const lane = freezeLane(options.lane);
    requireEvidenceBinding(evidence, basisId, lane);
    this.admissionCount = options.admissionCount;
    this.basis = Object.freeze({ id: basisId });
    this.causalDomain = Object.freeze({
      id: requireCertificateId(options.causalDomainId, 'causalDomain'),
    });
    this.evidence = evidence;
    this.lane = lane;
    this.selectorDigest = requireCertificateId(options.selectorDigest, 'selectorDigest');
    this.streamDigest = requireCertificateId(options.streamDigest, 'streamDigest');
    Object.freeze(this);
  }
}

function requireCertificateId(value: string, field: string): string {
  requireNonEmptyString(value, `entityAdmissionInventory.${field}`);
  return value;
}

function freezeLane(
  lane: LaneReference | null | undefined,
): EntityAdmissionInventoryLane {
  if (lane === null || lane === undefined) {
    throw new WarpError(
      'Entity admission inventory certificate requires a Lane reference',
      'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE',
    );
  }
  const { kind, name } = lane;
  const snapshot = Object.freeze({ kind, name });
  if (!isWorldlineLane(snapshot)) {
    throw new WarpError(
      'Entity admission inventory certificate requires a Lane reference',
      'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE',
    );
  }
  return snapshot;
}

function isWorldlineLane(
  lane: LaneReference,
): lane is EntityAdmissionInventoryLane {
  return lane.kind === 'worldline'
    && typeof lane.name === 'string'
    && lane.name.length > 0;
}

function requireEvidenceBinding(
  evidence: Evidence,
  basisId: string,
  lane: EntityAdmissionInventoryLane,
): void {
  if (
    evidence.basis.id !== basisId
    || evidence.tick?.id !== basisId
    || evidence.tick.timeline !== lane.name
  ) {
    throw new WarpError(
      'Entity admission inventory evidence must match its worldline basis',
      'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE',
    );
  }
}
