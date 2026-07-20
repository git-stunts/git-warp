/**
 * WasmVerifiedAdmissionPort — secure admission gate between external Wasm lowerers and WarpWorldline.
 */

import type { IntentAdmissionReceipt } from '../domain/admission/IntentAdmissionReceipt.ts';
import type { WarpIntentDescriptor } from '../domain/types/WarpIntentDescriptor.ts';

export type WasmVerifierReport = {
  readonly reportDigest: string;
  readonly wasmDigest: string;
  readonly verified: boolean;
};

export default abstract class WasmVerifiedAdmissionPort {
  abstract admitWasmIntent(
    descriptor: WarpIntentDescriptor,
    report: WasmVerifierReport,
  ): Promise<IntentAdmissionReceipt>;
}
