import ObservationDigest from '../../domain/services/custody/ObservationDigest.ts';

const MESSAGE_PATTERN = /^git-warp observation carrier\nversion 2\nbinding ([0-9a-f]{64})\nwriters (\d+)\nhistory ([0-9a-f]{64})\n$/u;

/**
 * What an attempt's history carrier claims (#1197): the attempt it belongs to, and the
 * count and digest of the writer heads its basis names. Its parents are the frontier
 * anchors that retain those heads, not the heads themselves.
 */
export default class ObservationCarrierMessage {
  readonly binding: ObservationDigest;
  readonly writers: number;
  readonly history: ObservationDigest;

  constructor(options: {
    readonly binding: ObservationDigest;
    readonly writers: number;
    readonly history: ObservationDigest;
  }) {
    this.binding = options.binding;
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
    const [binding = '', writers, history = ''] = match.slice(1);
    return new ObservationCarrierMessage({
      binding: new ObservationDigest(binding),
      writers: Number(writers),
      history: new ObservationDigest(history),
    });
  }

  /** True when `other` makes the same claim. */
  equals(other: ObservationCarrierMessage): boolean {
    return this.binding.equals(other.binding) && this.writers === other.writers && this.history.equals(other.history);
  }

  toString(): string {
    return [
      'git-warp observation carrier',
      'version 2',
      `binding ${this.binding.hex}`,
      `writers ${this.writers}`,
      `history ${this.history.hex}`,
      '',
    ].join('\n');
  }
}
