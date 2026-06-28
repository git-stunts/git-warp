/**
 * WasmVerifiedAdmissionService — implementation of WasmVerifiedAdmissionPort.
 */

import WasmVerifiedAdmissionPort, { type WasmVerifierReport } from '../../../ports/WasmVerifiedAdmissionPort.ts';
import type { WarpIntentDescriptor, WarpIntentOutcome } from '../../types/WarpIntentDescriptor.ts';
import type WarpWorldline from '../../WarpWorldline.ts';

export default class WasmVerifiedAdmissionService extends WasmVerifiedAdmissionPort {
  private readonly _worldline: WarpWorldline;
  private static readonly TRUSTED_WASM_DIGEST = 'sha256:7f8a9b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a';

  constructor(worldline: WarpWorldline) {
    super();
    this._worldline = worldline;
  }

  async admitWasmIntent(
    descriptor: WarpIntentDescriptor,
    report: WasmVerifierReport,
  ): Promise<WarpIntentOutcome> {
    if (!report.verified || report.wasmDigest !== WasmVerifiedAdmissionService.TRUSTED_WASM_DIGEST) {
      return {
        admitted: false,
        obstruction: {
          tag: 'UntrustedWasmVerifierReport',
          nodeId: descriptor.intentId,
          actual: report.wasmDigest,
        },
        intentId: descriptor.intentId,
      };
    }

    return await this._worldline.admitIntent(descriptor);
  }
}
