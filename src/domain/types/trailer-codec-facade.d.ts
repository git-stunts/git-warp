declare module '@git-stunts/trailer-codec' {
  export interface TrailerCodecPayload {
    title: string;
    trailers: Record<string, string>;
  }

  export interface TrailerCodecDecodedMessage {
    trailers: Record<string, string>;
  }

  export interface TrailerCodecFacade {
    encode(payload: TrailerCodecPayload): string;
    decode(message: string): TrailerCodecDecodedMessage;
  }

  export class TrailerCodecService {}

  export class TrailerCodec implements TrailerCodecFacade {
    constructor(options: {
      service: TrailerCodecService;
      bodyFormatOptions?: { keepTrailingNewline?: boolean };
    });
    encode(payload: TrailerCodecPayload): string;
    decode(message: string): TrailerCodecDecodedMessage;
  }

  export function createMessageHelpers(options?: {
    service: TrailerCodecService;
    bodyFormatOptions?: { keepTrailingNewline?: boolean };
  }): TrailerCodecFacade;
}
