import type { TickReceipt } from '../../domain/types/TickReceipt.ts';
import { sortedReplacer } from '../../domain/utils/canonicalStringify.ts';

export function tickReceiptCanonicalJson(receipt: TickReceipt): string {
  return JSON.stringify(receipt, sortedReplacer);
}
