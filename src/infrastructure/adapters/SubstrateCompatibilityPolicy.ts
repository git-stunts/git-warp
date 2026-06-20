type SubstrateCompatibilityPolicyFields = {
  readonly legacyContentBlobReads?: boolean;
  readonly legacyInlinePayloadReads?: boolean;
  readonly legacyPatchStorageReads?: boolean;
  readonly legacyTrustRecordBlobReads?: boolean;
};

/** Explicit adapter boundary for retired substrate read compatibility. */
export default class SubstrateCompatibilityPolicy {
  readonly legacyContentBlobReads: boolean;
  readonly legacyInlinePayloadReads: boolean;
  readonly legacyPatchStorageReads: boolean;
  readonly legacyTrustRecordBlobReads: boolean;

  constructor(fields: SubstrateCompatibilityPolicyFields = {}) {
    this.legacyContentBlobReads = fields.legacyContentBlobReads === true;
    this.legacyInlinePayloadReads = fields.legacyInlinePayloadReads === true;
    this.legacyPatchStorageReads = fields.legacyPatchStorageReads === true;
    this.legacyTrustRecordBlobReads = fields.legacyTrustRecordBlobReads === true;
    Object.freeze(this);
  }
}

export type SubstrateCompatibilityPolicyValue = SubstrateCompatibilityPolicy;

export const CURRENT_SUBSTRATE_ONLY_POLICY = new SubstrateCompatibilityPolicy();
