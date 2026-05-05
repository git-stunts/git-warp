export {
  DEFAULT_COMMIT_MESSAGE_CODEC,
  decodeAnchorMessage,
  decodeCheckpointMessage,
  decodePatchMessage,
  detectMessageKind,
  encodeAnchorMessage,
  encodeCheckpointMessage,
  encodePatchMessage,
} from '../../../infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts'; // nosemgrep: no-restricted-imports:core-infrastructure -- 0025D
export { encodeAuditMessage, decodeAuditMessage } from './AuditMessageCodec.ts';
export {
  detectSchemaVersion,
  assertOpsCompatible,
  SCHEMA_V2,
  SCHEMA_V3,
  PATCH_SCHEMA_V2,
  PATCH_SCHEMA_V3,
} from './MessageSchemaDetector.ts';
