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

export const ENTITY_ADMISSION_INVENTORY_SCHEMA =
  'warp/entity-admission-inventory@1' as const;

/** Terminal proof that one exact-basis admission inventory was fully consumed. */
export default class EntityAdmissionInventoryCertificate {
  readonly schema = ENTITY_ADMISSION_INVENTORY_SCHEMA;
  readonly admissionCount: number;
  readonly basis: Readonly<{ readonly id: string }>;
  readonly causalDomain: Readonly<{ readonly id: string }>;
  readonly completeness = 'complete' as const;
  readonly coveredDomain = 'retained-entity-add-admissions' as const;
  readonly evidence: Evidence;
  readonly lane: LaneReference;
  readonly ordering: Readonly<{
    readonly semantics: 'deterministic-non-causal';
    readonly direction: 'descending';
  }> = Object.freeze({
    semantics: 'deterministic-non-causal' as const,
    direction: 'descending' as const,
  });
  readonly selector: Readonly<{ readonly kind: 'lane' }> = Object.freeze({
    kind: 'lane' as const,
  });
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
    this.admissionCount = options.admissionCount;
    this.basis = Object.freeze({ id: requireCertificateId(options.basisId, 'basis') });
    this.causalDomain = Object.freeze({
      id: requireCertificateId(options.causalDomainId, 'causalDomain'),
    });
    this.evidence = freezeEvidence(options.evidence, 'entityAdmissionInventory.evidence');
    this.lane = freezeLane(options.lane);
    this.selectorDigest = requireCertificateId(options.selectorDigest, 'selectorDigest');
    this.streamDigest = requireCertificateId(options.streamDigest, 'streamDigest');
    Object.freeze(this);
  }
}

function requireCertificateId(value: string, field: string): string {
  requireNonEmptyString(value, `entityAdmissionInventory.${field}`);
  return value;
}

function freezeLane(lane: LaneReference): LaneReference {
  if (
    (lane.kind !== 'worldline' && lane.kind !== 'strand')
    || typeof lane.name !== 'string'
    || lane.name.length === 0
  ) {
    throw new WarpError(
      'Entity admission inventory certificate requires a Lane reference',
      'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE',
    );
  }
  return Object.freeze({ kind: lane.kind, name: lane.name });
}
