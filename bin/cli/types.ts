import type GitGraphAdapter from '../../src/infrastructure/adapters/GitGraphAdapter.ts';
import type { RuntimeHostProduct } from '../../src/domain/warp/RuntimeHostProduct.ts';

export type Persistence = GitGraphAdapter;
export type WarpGraphInstance = RuntimeHostProduct;

export type WriterTickInfo = {
  ticks: number[];
  tipSha: string | null;
  tickShas?: Record<number, string>;
};

export type CursorBlob = {
  tick: number;
  mode?: string;
  nodes?: number;
  edges?: number;
  frontierHash?: string;
};

export type CliOptions = {
  repo: string;
  json: boolean;
  ndjson: boolean;
  view: string | null;
  graph: string | null;
  writer: string;
  help: boolean;
};

export type GraphInfoResult = {
  name: string;
  writers: { count: number; ids?: string[] };
  checkpoint?: { ref: string; sha: string | null; date?: string | null };
  coverage?: { ref: string; sha: string | null };
  writerPatches?: Record<string, number>;
  cursor?: { active: boolean; tick?: number; mode?: string };
};

export type SeekSpec = {
  action: string;
  tickValue: string | null;
  name: string | null;
  noPersistentCache: boolean;
  diff: boolean;
  diffLimit: number;
};

export type QueryBuilderLike = {
  outgoing: (label?: string) => QueryBuilderLike;
  incoming: (label?: string) => QueryBuilderLike;
  where: (fn: Function) => QueryBuilderLike;
  match: (pattern: string) => QueryBuilderLike;
  select: (fields: string[]) => QueryBuilderLike;
  run: () => Promise<{ nodes: Array<{ id: string; props?: Record<string, unknown> }>; stateHash?: string }>;
};
