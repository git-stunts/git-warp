import { requireNonEmptyString } from '../utils/scalarValidation.ts';

export type RepairHint = {
  readonly code: string;
  readonly message: string;
};

export function freezeRepairHints(hints: readonly RepairHint[]): readonly RepairHint[] {
  return Object.freeze(
    hints.map((hint) => {
      requireNonEmptyString(hint.code, 'receipt.repairHint.code');
      requireNonEmptyString(hint.message, 'receipt.repairHint.message');
      return Object.freeze({ code: hint.code, message: hint.message });
    })
  );
}
