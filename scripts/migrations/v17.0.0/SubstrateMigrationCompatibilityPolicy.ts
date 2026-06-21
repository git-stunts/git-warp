import SubstrateCompatibilityPolicy from '../../../src/infrastructure/adapters/SubstrateCompatibilityPolicy.ts';

export const V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY = new SubstrateCompatibilityPolicy({
  legacyContentBlobReads: true,
  legacyInlinePayloadReads: true,
  legacyPatchStorageReads: true,
  legacyTrustRecordBlobReads: true,
});
