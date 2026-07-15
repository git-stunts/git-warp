import AuditError from './AuditError.ts';

/** Provider-neutral signal that an audit publication lost a head comparison. */
export default class AuditPublicationConflictError extends AuditError {
  static readonly CODE = 'E_AUDIT_PUBLICATION_CONFLICT';

  readonly expectedHead: string | null;
  readonly observedHead: string | null;

  constructor(expectedHead: string | null, observedHead: string | null) {
    super(
      `Audit publication conflict: expected ${String(expectedHead)}, observed ${String(observedHead)}`,
      {
        code: AuditPublicationConflictError.CODE,
        context: { expectedHead, observedHead },
      },
    );
    this.expectedHead = expectedHead;
    this.observedHead = observedHead;
  }
}
