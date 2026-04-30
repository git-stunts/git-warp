declare module '@git-stunts/trailer-codec' {
  type TrailerMessage = {
    readonly title: string;
    readonly trailers: Record<string, string>;
  };

  type DecodedTrailerMessage = {
    readonly trailers: Record<string, string>;
  };

  export type TrailerCodecFacade = {
    encode(message: TrailerMessage): string;
    decode(message: string): DecodedTrailerMessage;
  };

  export class TrailerCodecService {}

  export class TrailerCodec implements TrailerCodecFacade {
    constructor(options: { readonly service: TrailerCodecService });
    encode(message: TrailerMessage): string;
    decode(message: string): DecodedTrailerMessage;
  }
}
