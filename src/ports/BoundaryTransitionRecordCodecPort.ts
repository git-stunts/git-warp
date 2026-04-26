import BoundaryTransitionRecord from '../domain/services/provenance/BTR.ts';
import BtrSigningEnvelope from '../domain/services/provenance/BtrSigningEnvelope.ts';
import BtrSigningBytes from '../domain/services/provenance/BtrSigningBytes.ts';

type BoundaryTransitionRecordDecoded = {
  readonly kind: 'decoded_boundary_transition_record';
  readonly record: BoundaryTransitionRecord;
};

type BoundaryTransitionRecordDecodeFailed = {
  readonly kind: 'boundary_transition_record_decode_failed';
  readonly reason: string;
};

type BoundaryTransitionRecordDecodeResult =
  | BoundaryTransitionRecordDecoded
  | BoundaryTransitionRecordDecodeFailed;

export default abstract class BoundaryTransitionRecordCodecPort {
  abstract signingBytes(_envelope: BtrSigningEnvelope): BtrSigningBytes;

  abstract encodeRecord(_record: BoundaryTransitionRecord): Uint8Array;

  abstract decodeRecord(_bytes: Uint8Array): BoundaryTransitionRecordDecodeResult;
}

export {
  BoundaryTransitionRecordCodecPort,
};
export type {
  BoundaryTransitionRecordDecoded,
  BoundaryTransitionRecordDecodeFailed,
  BoundaryTransitionRecordDecodeResult,
};
