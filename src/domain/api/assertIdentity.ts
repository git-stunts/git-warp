import WarpError from '../errors/WarpError.ts';

type IdentityAssertionFailure = {
  readonly message: string;
  readonly code: string;
};

export function assertIdentity(
  value: string | null | undefined,
  field: string,
  failure: IdentityAssertionFailure,
): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WarpError(failure.message, failure.code, { context: { field } });
  }
}
