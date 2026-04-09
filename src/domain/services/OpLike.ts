import type { Dot } from '../crdt/Dot.ts';

export type RawDotLike = {
  readonly writerId?: string;
  readonly counter?: number;
};

/** Minimal op shape accepted by reducer strategy method signatures. */
export type OpLike = {
  readonly type: string;
  readonly node?: string;
  readonly dot?: Dot | RawDotLike;
  readonly scope?: number;
  readonly observedDots?: Iterable<string>;
  readonly from?: string;
  readonly to?: string;
  readonly label?: string;
  readonly key?: string;
  readonly value?: unknown;
  readonly oid?: string;
};
