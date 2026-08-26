import PatchError from '../errors/PatchError.ts';
import { Dot } from '../crdt/Dot.ts';

export type EntityAdmissionOriginKind =
  | 'allocated'
  | 'supplied-subject'
  | 'legacy-unrecorded';

export type EntityAdmissionOriginOptions =
  | Readonly<{ kind: 'allocated'; namespace: string; allocationDot: Dot }>
  | Readonly<{ kind: 'supplied-subject' }>
  | Readonly<{ kind: 'legacy-unrecorded' }>;

/** Immutable disclosure of how one entity representation subject was chosen. */
export default class EntityAdmissionOrigin {
  readonly allocationDot: Dot | null;
  readonly kind: EntityAdmissionOriginKind;
  readonly namespace: string | null;

  constructor(options: EntityAdmissionOriginOptions | null | undefined) {
    if (options === null || options === undefined) {
      throw originError('Entity admission origin is required');
    }
    this.kind = requireOriginKind(options.kind);
    this.namespace = requireOriginNamespace(options);
    this.allocationDot = requireOriginAllocationDot(options);
    Object.freeze(this);
  }

  static allocated(namespace: string, allocationDot: Dot): EntityAdmissionOrigin {
    return new EntityAdmissionOrigin({ kind: 'allocated', namespace, allocationDot });
  }

  static suppliedSubject(): EntityAdmissionOrigin {
    return new EntityAdmissionOrigin({ kind: 'supplied-subject' });
  }

  static legacyUnrecorded(): EntityAdmissionOrigin {
    return new EntityAdmissionOrigin({ kind: 'legacy-unrecorded' });
  }
}

function requireOriginKind(kind: EntityAdmissionOriginKind): EntityAdmissionOriginKind {
  if (
    kind !== 'allocated'
    && kind !== 'supplied-subject'
    && kind !== 'legacy-unrecorded'
  ) {
    throw originError('Entity admission origin kind is unsupported');
  }
  return kind;
}

function requireOriginNamespace(options: EntityAdmissionOriginOptions): string | null {
  if (options.kind === 'allocated') {
    return requireAllocatedNamespace(options.namespace);
  }
  requireNoAllocationFields(options);
  return null;
}

function requireAllocatedNamespace(namespace: string): string {
  if (typeof namespace !== 'string' || namespace.trim().length === 0) {
    throw originError('Allocated entity admission origin requires a namespace');
  }
  return namespace;
}

function requireNoAllocationFields(
  options: Exclude<EntityAdmissionOriginOptions, { readonly kind: 'allocated' }>,
): void {
  if ('namespace' in options || 'allocationDot' in options) {
    throw originError('Only allocated entity admissions carry allocation metadata');
  }
}

function requireOriginAllocationDot(options: EntityAdmissionOriginOptions): Dot | null {
  if (options.kind !== 'allocated') {
    return null;
  }
  if (!(options.allocationDot instanceof Dot)) {
    throw originError('Allocated entity admission origin requires its allocation Dot');
  }
  return options.allocationDot;
}

function originError(message: string): PatchError {
  return new PatchError(message, { code: 'E_PATCH_ENTITY_ADMISSION_ORIGIN' });
}
