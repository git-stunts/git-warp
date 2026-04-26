type BtrWireContext = {
  readonly [writerId: string]: number;
};

type BtrWireDot = {
  readonly writerId: string;
  readonly counter: number;
};

type BtrWireOperation =
  | {
    readonly type: 'NodeAdd';
    readonly node: string;
    readonly dot: BtrWireDot;
  }
  | {
    readonly type: 'NodeRemove';
    readonly node: string;
    readonly observedDots: readonly string[];
  }
  | {
    readonly type: 'EdgeAdd';
    readonly from: string;
    readonly to: string;
    readonly label: string;
    readonly dot: BtrWireDot;
  }
  | {
    readonly type: 'EdgeRemove';
    readonly from: string;
    readonly to: string;
    readonly label: string;
    readonly observedDots: readonly string[];
  }
  | {
    readonly type: 'PropSet';
    readonly node: string;
    readonly key: string;
    readonly value: unknown;
  }
  | {
    readonly type: 'NodePropSet';
    readonly node: string;
    readonly key: string;
    readonly value: unknown;
  }
  | {
    readonly type: 'EdgePropSet';
    readonly from: string;
    readonly to: string;
    readonly label: string;
    readonly key: string;
    readonly value: unknown;
  }
  | {
    readonly type: 'BlobValue';
    readonly node: string;
    readonly oid: string;
  };

type BtrCanonicalPatch = {
  readonly schema: 2 | 3;
  readonly writer: string;
  readonly lamport: number;
  readonly context: BtrWireContext;
  readonly ops: readonly BtrWireOperation[];
  readonly reads?: readonly string[];
  readonly writes?: readonly string[];
};

type BtrWireProvenanceEntry = {
  readonly patch: BtrCanonicalPatch;
  readonly sha: string;
};

export type {
  BtrCanonicalPatch,
  BtrWireContext,
  BtrWireDot,
  BtrWireOperation,
  BtrWireProvenanceEntry,
};
