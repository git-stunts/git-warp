export { encodeAuditMessage, decodeAuditMessage } from './AuditMessageCodec.ts';
export {
  detectSchemaVersion,
  assertOpsCompatible,
  CLASSIC_PATCH_SCHEMA_VERSION,
  EDGE_PROPERTY_PATCH_SCHEMA_VERSION,
  PATCH_SCHEMA_CLASSIC,
  PATCH_SCHEMA_EDGE_PROPERTIES,
} from './MessageSchemaDetector.ts';
