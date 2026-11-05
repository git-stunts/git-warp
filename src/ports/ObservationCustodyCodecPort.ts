import type ObservationDecodeFailure from '../domain/services/custody/ObservationDecodeFailure.ts';
import type ObservationPreparation from '../domain/services/custody/ObservationPreparation.ts';
import type ObservationPreparedPage from '../domain/services/custody/ObservationPreparedPage.ts';
import type ObservationReceiptCore from '../domain/services/custody/ObservationReceiptCore.ts';
import type ObservationRecord from '../domain/services/custody/ObservationRecord.ts';
import type ObservationSettlementPage from '../domain/services/custody/ObservationSettlementPage.ts';

/**
 * Canonical, domain-separated and versioned bytes of observation identity
 * (#1067). Each encoding is the only accepted form of its value: decoders
 * reject unsupported versions, surplus or duplicate fields and alternate
 * encodings as explicit failures rather than normalizing them.
 */
export default abstract class ObservationCustodyCodecPort {
  abstract encodePreparation(_preparation: ObservationPreparation): Uint8Array;
  abstract decodePreparation(_bytes: Uint8Array): ObservationPreparation | ObservationDecodeFailure;

  abstract encodeCore(_core: ObservationReceiptCore): Uint8Array;
  abstract decodeCore(_bytes: Uint8Array): ObservationReceiptCore | ObservationDecodeFailure;

  abstract encodeRecord(_record: ObservationRecord): Uint8Array;
  abstract decodeRecord(_bytes: Uint8Array): ObservationRecord | ObservationDecodeFailure;

  abstract encodePreparedPage(_page: ObservationPreparedPage): Uint8Array;
  abstract decodePreparedPage(_bytes: Uint8Array): ObservationPreparedPage | ObservationDecodeFailure;

  abstract encodeSettlementPage(_page: ObservationSettlementPage): Uint8Array;
  abstract decodeSettlementPage(_bytes: Uint8Array): ObservationSettlementPage | ObservationDecodeFailure;
}
