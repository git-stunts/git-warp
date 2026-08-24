import type {
  GitCatFileSession,
  GitFastImportSession,
  GitMktreeSession,
  GitUpdateRefSession,
} from '@git-stunts/plumbing';
import type { GitPlumbing } from '../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';

/** Session-capable plumbing surface required to preserve production process topology. */
export type PerformanceGitPlumbing = GitPlumbing &
  Readonly<{
    openCatFileSession(): Promise<GitCatFileSession>;
    openFastImportSession(): Promise<GitFastImportSession>;
    openMktreeSession(): Promise<GitMktreeSession>;
    openUpdateRefSession(): Promise<GitUpdateRefSession>;
  }>;

export type PerformanceCatFileSession = GitCatFileSession;
export type PerformanceFastImportSession = GitFastImportSession;
export type PerformanceMktreeSession = GitMktreeSession;
export type PerformanceUpdateRefSession = GitUpdateRefSession;
