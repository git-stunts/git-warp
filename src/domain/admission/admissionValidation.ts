import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';

export function freezeAdmissionRefs(
  values: readonly string[],
  field: string,
  minimumDistinctValues = 0
): readonly string[] {
  requireArray(values, field);

  const checked: string[] = [];
  values.forEach((value, index) => {
    requireNonEmptyString(value, `${field}[${index}]`);
    checked.push(value);
  });
  const distinct = [...new Set(checked)].sort();
  if (distinct.length < minimumDistinctValues) {
    throw new WarpError(
      `${field} must contain at least ${String(minimumDistinctValues)} distinct values`,
      'E_VALIDATION'
    );
  }
  return Object.freeze(distinct);
}

function requireArray(values: readonly string[], field: string): void {
  if (!Array.isArray(values)) {
    throw new WarpError(`${field} must be an array`, 'E_VALIDATION');
  }
}
