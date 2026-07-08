import WarpError from '../errors/WarpError.ts';
import { validateGraphName, validateWriterId } from '../utils/RefLayout.ts';

type IdentityAssertionFailure = {
  readonly message: string;
  readonly code: string;
};

export function assertIdentity(
  value: string | null | undefined,
  field: string,
  failure: IdentityAssertionFailure,
): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WarpError(failure.message, failure.code, { context: { field } });
  }
}

export function assertTimelineNameIdentity(
  value: string | null | undefined,
  field: string,
  failure: IdentityAssertionFailure,
): void {
  assertIdentity(value, field, failure);
  validateGraphName(value);
}

export function assertWriterIdentity(
  value: string | null | undefined,
  field: string,
  failure: IdentityAssertionFailure,
): void {
  assertIdentity(value, field, failure);
  validateWriterId(value);
}
