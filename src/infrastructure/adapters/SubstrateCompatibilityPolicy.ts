type SubstrateCompatibilityPolicyFields = {
  readonly legacyAuditReceiptTreeReads?: boolean;
  readonly legacyContentBlobReads?: boolean;
  readonly legacyInlinePayloadReads?: boolean;
  readonly legacyPatchStorageReads?: boolean;
  readonly legacyStrandDescriptorBlobReads?: boolean;
  readonly legacyTrustRecordBlobReads?: boolean;
};

/** Explicit adapter boundary for retired substrate read compatibility. */
export default class SubstrateCompatibilityPolicy {
  readonly legacyAuditReceiptTreeReads: boolean;
  readonly legacyContentBlobReads: boolean;
  readonly legacyInlinePayloadReads: boolean;
  readonly legacyPatchStorageReads: boolean;
  readonly legacyStrandDescriptorBlobReads: boolean;
  readonly legacyTrustRecordBlobReads: boolean;

  constructor(fields: SubstrateCompatibilityPolicyFields = {}) {
    this.legacyAuditReceiptTreeReads = fields.legacyAuditReceiptTreeReads === true;
    this.legacyContentBlobReads = fields.legacyContentBlobReads === true;
    this.legacyInlinePayloadReads = fields.legacyInlinePayloadReads === true;
    this.legacyPatchStorageReads = fields.legacyPatchStorageReads === true;
    this.legacyStrandDescriptorBlobReads = fields.legacyStrandDescriptorBlobReads === true;
    this.legacyTrustRecordBlobReads = fields.legacyTrustRecordBlobReads === true;
    Object.freeze(this);
  }
}

export type SubstrateCompatibilityPolicyValue = SubstrateCompatibilityPolicy;

export const CURRENT_SUBSTRATE_ONLY_POLICY = new SubstrateCompatibilityPolicy();
