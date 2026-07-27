import type GitTimelineHistoryAdapter from '../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import type { RuntimeHostProduct } from '../../src/domain/warp/RuntimeHostProduct.ts';

export type Persistence = GitTimelineHistoryAdapter;
export type WarpGraphInstance = RuntimeHostProduct;

export type CliOptions = {
  repo: string;
  lane: string | null;
  strand: string | null;
  json: boolean;
  jsonl: boolean;
  writer: string;
  writerExplicit: boolean;
  help: boolean;
};
