import Mergeability from '../Mergeability.ts';
import PrBranchUpdateError from '../PrBranchUpdateError.ts';
import type GitHubJsonReader from './GitHubJsonReader.ts';

const MAX_OPEN_PULL_REQUESTS = 100;

const MERGEABILITY_BY_NAME: ReadonlyMap<string, Mergeability> = new Map([
  ['MERGEABLE', Mergeability.MERGEABLE],
  ['CONFLICTING', Mergeability.CONFLICTING],
  ['UNKNOWN', Mergeability.UNKNOWN],
]);

/** One GraphQL pull request node, before the updater measures how far it is behind. */
export type PullRequestListEntry = {
  readonly number: number;
  readonly baseRefName: string;
  readonly headRefName: string;
  readonly headOid: string;
  readonly isDraft: boolean;
  readonly isFork: boolean;
  readonly mergeability: Mergeability;
};

/** The base tip and the open pull requests that target it, decoded from one GraphQL response. */
export default class PullRequestListing {
  readonly baseOid: string;
  readonly entries: readonly PullRequestListEntry[];

  constructor(baseOid: string, entries: readonly PullRequestListEntry[]) {
    this.baseOid = baseOid;
    this.entries = Object.freeze([...entries]);
    Object.freeze(this);
  }

  static decode(response: GitHubJsonReader, baseRef: string): PullRequestListing {
    const repository = response.field('data').field('repository');
    const ref = repository.field('ref');
    if (ref.isNull) {
      throw new PrBranchUpdateError(`base branch ${baseRef} does not exist`);
    }
    const pullRequests = repository.field('pullRequests');
    if (pullRequests.field('pageInfo').field('hasNextPage').flag()) {
      throw new PrBranchUpdateError(`more than ${MAX_OPEN_PULL_REQUESTS} open pull requests target ${baseRef}; the updater reads one page`);
    }
    const entries = pullRequests.field('nodes').items().map(decodeEntry);
    return new PullRequestListing(ref.field('target').field('oid').text(), entries);
  }
}

function decodeEntry(node: GitHubJsonReader): PullRequestListEntry {
  return {
    number: node.field('number').count(),
    baseRefName: node.field('baseRefName').text(),
    headRefName: node.field('headRefName').text(),
    headOid: node.field('headRefOid').text(),
    isDraft: node.field('isDraft').flag(),
    isFork: node.field('isCrossRepository').flag(),
    mergeability: decodeMergeability(node.field('mergeable').text()),
  };
}

function decodeMergeability(name: string): Mergeability {
  const mergeability = MERGEABILITY_BY_NAME.get(name);
  if (mergeability === undefined) {
    throw new PrBranchUpdateError(`GitHub returned mergeable value "${name}"; expected MERGEABLE, CONFLICTING or UNKNOWN`);
  }
  return mergeability;
}
