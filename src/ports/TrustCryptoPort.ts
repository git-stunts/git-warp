export type TrustSignatureVerification = {
  readonly algorithm: string;
  readonly publicKeyBase64: string;
  readonly signatureBase64: string;
  readonly payload: Uint8Array;
};

export default abstract class TrustCryptoPort {
  abstract verifySignature(_params: TrustSignatureVerification): boolean;
  abstract computeKeyFingerprint(_publicKeyBase64: string): string;
}
