import PatchError from '../errors/PatchError.ts';

export type EntityAdmissionOriginKind =
  | 'allocated'
  | 'supplied-subject'
  | 'legacy-unrecorded';

export type EntityAdmissionOriginOptions =
  | Readonly<{ kind: 'allocated'; namespace: string }>
  | Readonly<{ kind: 'supplied-subject' }>
  | Readonly<{ kind: 'legacy-unrecorded' }>;

/** Immutable disclosure of how one entity representation subject was chosen. */
export default class EntityAdmissionOrigin {
  readonly kind: EntityAdmissionOriginKind;
  readonly namespace: string | null;

  constructor(options: EntityAdmissionOriginOptions | null | undefined) {
    if (options === null || options === undefined) {
      throw originError('Entity admission origin is required');
    }
    this.kind = requireOriginKind(options.kind);
    this.namespace = requireOriginNamespace(options);
    Object.freeze(this);
  }

  static allocated(namespace: string): EntityAdmissionOrigin {
    return new EntityAdmissionOrigin({ kind: 'allocated', namespace });
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
  if (options.kind !== 'allocated') {
    if ('namespace' in options) {
      throw originError('Only allocated entity admissions carry a namespace');
    }
    return null;
  }
  if (typeof options.namespace !== 'string' || options.namespace.trim().length === 0) {
    throw originError('Allocated entity admission origin requires a namespace');
  }
  return options.namespace;
}

function originError(message: string): PatchError {
  return new PatchError(message, { code: 'E_PATCH_ENTITY_ADMISSION_ORIGIN' });
}
