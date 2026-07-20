/**
 * WasmVerifiedAdmissionService — implementation of WasmVerifiedAdmissionPort.
 */

import WasmVerifiedAdmissionPort, { type WasmVerifierReport } from '../../../ports/WasmVerifiedAdmissionPort.ts';
import AdmissionObstructionReason from '../../admission/AdmissionObstructionReason.ts';
import AdmissionRetryDisposition from '../../admission/AdmissionRetryDisposition.ts';
import type { IntentAdmissionReceipt } from '../../admission/IntentAdmissionReceipt.ts';
import type { WarpIntentDescriptor } from '../../types/WarpIntentDescriptor.ts';
import type WarpWorldline from '../../WarpWorldline.ts';
import { createObstructedIntentAdmissionReceipt } from './IntentAdmissionReceiptFactory.ts';

export type WasmVerifiedAdmissionServiceOptions = {
  readonly worldline: WarpWorldline;
  readonly readAdmissionBasis: () => Promise<string>;
};

export default class WasmVerifiedAdmissionService extends WasmVerifiedAdmissionPort {
  private readonly _worldline: WarpWorldline;
  private readonly _readAdmissionBasis: () => Promise<string>;
  private static readonly TRUSTED_WASM_DIGEST = 'sha256:7f8a9b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a';

  constructor(options: WasmVerifiedAdmissionServiceOptions) {
    super();
    this._worldline = options.worldline;
    this._readAdmissionBasis = options.readAdmissionBasis;
  }

  async admitWasmIntent(
    descriptor: WarpIntentDescriptor,
    report: WasmVerifierReport,
  ): Promise<IntentAdmissionReceipt> {
    if (!report.verified || report.wasmDigest !== WasmVerifiedAdmissionService.TRUSTED_WASM_DIGEST) {
      return await this._untrustedReportReceipt(descriptor, report);
    }

    return await this._worldline.admitIntent(descriptor);
  }

  private async _untrustedReportReceipt(
    descriptor: WarpIntentDescriptor,
    report: WasmVerifierReport,
  ): Promise<IntentAdmissionReceipt> {
    return createObstructedIntentAdmissionReceipt({
      descriptor,
      graphName: this._worldline.worldlineName,
      writerId: this._worldline.writerId,
      channel: 'admitted',
      ownerId: this._worldline.writerId,
    }, {
      destinationBasisRef: await this._readAdmissionBasis(),
      reason: AdmissionObstructionReason.invalidDerivation(
        'git-warp.untrusted-wasm-verifier-report'
      ),
      suppliedEvidenceRefs: wasmReportEvidenceRefs(report),
      requiredEvidenceRefs: trustedWasmEvidenceRefs(
        WasmVerifiedAdmissionService.TRUSTED_WASM_DIGEST
      ),
      failedConditionRef: 'warp:condition:trusted-wasm-verifier-report',
      retry: AdmissionRetryDisposition.withEvidence(),
    });
  }
}

function wasmReportEvidenceRefs(report: WasmVerifierReport): readonly string[] {
  return [
    `warp:wasm-report:${encodeURIComponent(report.reportDigest)}`,
    `warp:wasm-report-status:${report.verified ? 'verified' : 'unverified'}`,
    `warp:wasm-module:${encodeURIComponent(report.wasmDigest)}`,
  ];
}

function trustedWasmEvidenceRefs(trustedDigest: string): readonly string[] {
  return [
    'warp:wasm-report:verified',
    `warp:wasm-module:${encodeURIComponent(trustedDigest)}`,
  ];
}
