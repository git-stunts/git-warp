import type { Dot } from '../crdt/Dot.ts';

export type RawDotLike = { // nosemgrep: ts-no-like-types -- 0025C
  readonly writerId?: string;
  readonly counter?: number;
};

/** Minimal op shape accepted by reducer strategy method signatures. */
export type OpLike = { // nosemgrep: ts-no-like-types -- 0025C
  readonly type: string;
  readonly node?: string;
  readonly dot?: Dot | RawDotLike; // nosemgrep: ts-no-like-types -- 0025C
  readonly scope?: number;
  readonly observedDots?: Iterable<string>;
  readonly from?: string;
  readonly to?: string;
  readonly label?: string;
  readonly key?: string;
  readonly value?: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  readonly oid?: string;
};
