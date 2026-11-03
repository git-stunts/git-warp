import ObservationDigest from '../../domain/services/custody/ObservationDigest.ts';

const MESSAGE_PATTERN = /^git-warp observation carrier\nversion 1\nbinding ([0-9a-f]{64})\nsequence (\d+)\nwriters (\d+)\nhistory ([0-9a-f]{64})\n$/u;

/**
 * What one history carrier commit claims: the attempt it belongs to, its place
 * in the chain, and the count and rolling digest of the writer heads retained
 * by it and every carrier before it.
 */
export default class ObservationCarrierMessage {
  readonly binding: ObservationDigest;
  readonly sequence: number;
  readonly writers: number;
  readonly history: ObservationDigest;

  constructor(options: {
    readonly binding: ObservationDigest;
    readonly sequence: number;
    readonly writers: number;
    readonly history: ObservationDigest;
  }) {
    this.binding = options.binding;
    this.sequence = options.sequence;
    this.writers = options.writers;
    this.history = options.history;
    Object.freeze(this);
  }

  /** The claim in a carrier's commit message, or null when it is not exactly one. */
  static parse(message: string): ObservationCarrierMessage | null {
    const match = MESSAGE_PATTERN.exec(message.endsWith('\n') ? message : `${message}\n`);
    if (match === null) {
      return null;
    }
    return new ObservationCarrierMessage({
      binding: new ObservationDigest(match[1] ?? ''),
      sequence: Number(match[2]),
      writers: Number(match[3]),
      history: new ObservationDigest(match[4] ?? ''),
    });
  }

  toString(): string {
    return [
      'git-warp observation carrier',
      'version 1',
      `binding ${this.binding.hex}`,
      `sequence ${this.sequence}`,
      `writers ${this.writers}`,
      `history ${this.history.hex}`,
      '',
    ].join('\n');
  }
}
