import PrBranchUpdateError from '../PrBranchUpdateError.ts';
import type { PullRequestHostPort } from '../PullRequestHostPort.ts';
import PullRequestSnapshot from '../PullRequestSnapshot.ts';
import GitHubJsonReader from './GitHubJsonReader.ts';
import PullRequestListing from './PullRequestListing.ts';
import runGh, { type GhRunner } from './runGh.ts';

const REPOSITORY_NAME = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/u;

const LIST_QUERY = `query($owner: String!, $name: String!, $base: String!, $baseRef: String!) {
  repository(owner: $owner, name: $name) {
    ref(qualifiedName: $baseRef) { target { oid } }
    pullRequests(states: OPEN, baseRefName: $base, first: 100) {
      pageInfo { hasNextPage }
      nodes { number baseRefName headRefName headRefOid isDraft isCrossRepository mergeable }
    }
  }
}`;

export type PullRequestHostTarget = {
  /** `owner/name`. */
  readonly repository: string;
  readonly baseRefName: string;
};

/** PullRequestHostPort over the `gh` command line, authenticated by GH_TOKEN. */
export default class GhCliPullRequestHost implements PullRequestHostPort {
  readonly #owner: string;
  readonly #name: string;
  readonly #baseRefName: string;
  readonly #run: GhRunner;

  constructor(target: PullRequestHostTarget, run: GhRunner = runGh) {
    const [owner, name] = splitRepository(target.repository);
    this.#owner = owner;
    this.#name = name;
    this.#baseRefName = target.baseRefName;
    this.#run = run;
    Object.freeze(this);
  }

  async listOpenPullRequests(): Promise<readonly PullRequestSnapshot[]> {
    const baseRef = `refs/heads/${this.#baseRefName}`;
    const listing = PullRequestListing.decode(await this.#json([
      'api', 'graphql', '-f', `query=${LIST_QUERY}`,
      '-f', `owner=${this.#owner}`, '-f', `name=${this.#name}`, '-f', `base=${this.#baseRefName}`, '-f', `baseRef=${baseRef}`,
    ]), baseRef);
    const snapshots: PullRequestSnapshot[] = [];
    for (const entry of listing.entries) {
      const behindBy = await this.#behindBy(listing.baseOid, entry.headOid);
      snapshots.push(new PullRequestSnapshot({ ...entry, behindBy }));
    }
    return snapshots;
  }

  async updateBranch(pullRequest: PullRequestSnapshot): Promise<void> {
    await this.#run([
      'api', this.#endpoint(`pulls/${pullRequest.number}/update-branch`), '--method', 'PUT',
      '-f', `expected_head_sha=${pullRequest.headOid}`,
    ]);
  }

  async readHeadOid(pullRequestNumber: number): Promise<string> {
    const pull = await this.#json(['api', this.#endpoint(`pulls/${pullRequestNumber}`)]);
    return pull.field('head').field('sha').text();
  }

  async dispatchWorkflow(workflowFile: string, ref: string): Promise<void> {
    await this.#run([
      'api', this.#endpoint(`actions/workflows/${workflowFile}/dispatches`), '--method', 'POST', '-f', `ref=${ref}`,
    ]);
  }

  async listCommentBodies(pullRequestNumber: number): Promise<readonly string[]> {
    const pages = await this.#json([
      'api', this.#endpoint(`issues/${pullRequestNumber}/comments`), '--method', 'GET', '--paginate', '--slurp',
    ]);
    return pages.items().flatMap((page) => page.items().map((comment) => comment.field('body').text()));
  }

  async createComment(pullRequestNumber: number, body: string): Promise<void> {
    await this.#run([
      'api', this.#endpoint(`issues/${pullRequestNumber}/comments`), '--method', 'POST', '-f', `body=${body}`,
    ]);
  }

  async #behindBy(baseOid: string, headOid: string): Promise<number> {
    const comparison = await this.#json([
      'api', this.#endpoint(`compare/${baseOid}...${headOid}`), '--jq', '{behind_by: .behind_by}',
    ]);
    return comparison.field('behind_by').count();
  }

  async #json(args: readonly string[]): Promise<GitHubJsonReader> {
    return GitHubJsonReader.parse(await this.#run(args), `gh ${args.slice(0, 2).join(' ')}`);
  }

  #endpoint(path: string): string {
    return `repos/${this.#owner}/${this.#name}/${path}`;
  }
}

function splitRepository(repository: string): readonly [string, string] {
  const match = REPOSITORY_NAME.exec(repository);
  const owner = match?.[1];
  const name = match?.[2];
  if (owner === undefined || name === undefined) {
    throw new PrBranchUpdateError(`repository must be owner/name, got "${repository}"`);
  }
  return [owner, name];
}
