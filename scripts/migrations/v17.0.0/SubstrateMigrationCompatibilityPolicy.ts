import SubstrateCompatibilityPolicy from '../../../src/infrastructure/adapters/SubstrateCompatibilityPolicy.ts';

export const V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY = new SubstrateCompatibilityPolicy({
  legacyAuditReceiptTreeReads: true,
  legacyContentBlobReads: true,
  legacyInlinePayloadReads: true,
  legacyPatchStorageReads: true,
  legacyStrandDescriptorBlobReads: true,
  legacyTrustRecordBlobReads: true,
});
