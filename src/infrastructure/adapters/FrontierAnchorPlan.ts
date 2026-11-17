import type CryptoPort from '../../ports/CryptoPort.ts';
import FrontierAnchorBucket, { FRONTIER_ANCHOR_FANOUT } from './FrontierAnchorBucket.ts';
import type GitObjectFormat from './GitObjectFormat.ts';

/** One writer's head as the basis frontier names it. */
export type FrontierHead = { readonly writer: string; readonly head: string };

/** One anchor commit: its object id, its parents in order and its message. */
export type FrontierAnchor = { readonly oid: string; readonly parents: readonly string[]; readonly message: string };

/** The author and committer of every anchor: a fixed identity at the epoch, so no clock or host enters. */
export const FRONTIER_ANCHOR_IDENTITY = 'git-warp frontier anchor <frontier-anchor@git-warp.invalid> 0 +0000';

const MESSAGE_HEADER = 'git-warp frontier anchor';
const MESSAGE_VERSION = 'version 1';
const DIGEST_DOMAIN = 'git-warp frontier anchor heads\n';
const DIGEST_ALGORITHM = 'sha256';
const encoder = new TextEncoder();

type Buckets = ReadonlyMap<number, ReadonlyMap<number, readonly string[]>>;

/** Builds anchors in order and records each one. */
class AnchorBuilder {
  readonly anchors: FrontierAnchor[] = [];
  readonly #crypto: CryptoPort;
  readonly #lane: string;
  readonly #format: GitObjectFormat;

  constructor(fields: { readonly crypto: CryptoPort; readonly lane: string; readonly format: GitObjectFormat }) {
    this.#crypto = fields.crypto;
    this.#lane = fields.lane;
    this.#format = fields.format;
  }

  /** The last anchor of a leaf's chain: each link names the previous one and up to 63 more heads. */
  async leaf(bucket: string, heads: readonly string[]): Promise<string> {
    let link = '';
    for (let start = 0; start < heads.length; start += FRONTIER_ANCHOR_FANOUT) {
      const batch = heads.slice(start, start + FRONTIER_ANCHOR_FANOUT);
      link = await this.anchor({ bucket, parents: start === 0 ? batch : [link, ...batch], covered: heads.slice(0, start + batch.length) });
    }
    return link;
  }

  async anchor(fields: { readonly bucket: string; readonly parents: readonly string[]; readonly covered: readonly string[] }): Promise<string> {
    const digest = await this.#crypto.hash(DIGEST_ALGORITHM, `${DIGEST_DOMAIN}${fields.covered.map((head) => `${head}\n`).join('')}`);
    const message = [
      MESSAGE_HEADER, MESSAGE_VERSION, `lane ${this.#lane}`, `bucket ${fields.bucket}`, `heads ${fields.covered.length}`, `digest ${digest}`, '',
    ].join('\n');
    const oid = await this.#oidOf(fields.parents, message);
    this.anchors.push(Object.freeze({ oid, parents: Object.freeze([...fields.parents]), message }));
    return oid;
  }

  /** The id Git gives a commit object with these parents and message: the hash of its header and body. */
  async #oidOf(parents: readonly string[], message: string): Promise<string> {
    const body = encoder.encode([
      `tree ${this.#format.emptyTree}`,
      ...parents.map((parent) => `parent ${parent}`),
      `author ${FRONTIER_ANCHOR_IDENTITY}`,
      `committer ${FRONTIER_ANCHOR_IDENTITY}`,
      '',
      message,
    ].join('\n'));
    const header = encoder.encode(`commit ${body.length}\0`);
    const object = new Uint8Array(header.length + body.length);
    object.set(header);
    object.set(body, header.length);
    return await this.#crypto.hash(this.#format.algorithm, object);
  }
}

/**
 * The frontier anchors that retain one lane's frontier (#1197). Each head goes to its
 * writer's bucket ({@link FrontierAnchorBucket}), in frontier order. A leaf anchor names at
 * most 63 heads of one leaf bucket, and the previous anchor of that leaf when the leaf holds
 * more, so a larger leaf is a chain. A branch anchor names the last anchor of each non-empty
 * leaf of its branch. A carrier names the branch anchors, so it never names more than 63.
 *
 * Every anchor is a commit of the empty tree, by {@link FRONTIER_ANCHOR_IDENTITY}, whose
 * message names the lane, the bucket, the count of heads it covers and their digest. Its id
 * is therefore a pure function of the lane and the heads, computed here without Git: every
 * clone computes the same anchors, and an anchor whose heads did not change is the same object.
 */
export default class FrontierAnchorPlan {
  /** Every anchor, each one after the anchors it names. */
  readonly anchors: readonly FrontierAnchor[];
  /** The branch anchors in branch order: what a carrier names. */
  readonly tops: readonly string[];

  private constructor(anchors: readonly FrontierAnchor[], tops: readonly string[]) {
    this.anchors = Object.freeze([...anchors]);
    this.tops = Object.freeze([...tops]);
    Object.freeze(this);
  }

  static async of(fields: {
    readonly crypto: CryptoPort;
    readonly lane: string;
    readonly format: GitObjectFormat;
    readonly heads: readonly FrontierHead[];
  }): Promise<FrontierAnchorPlan> {
    const builder = new AnchorBuilder(fields);
    const tops: string[] = [];
    for (const [branch, leaves] of await bucketed(fields.crypto, fields.heads)) {
      const tips: string[] = [];
      for (const [leaf, heads] of leaves) {
        tips.push(await builder.leaf(`${branch}/${leaf}`, heads));
      }
      tops.push(await builder.anchor({ bucket: `${branch}`, parents: tips, covered: [...leaves.values()].flat() }));
    }
    return new FrontierAnchorPlan(builder.anchors, tops);
  }
}

/** Heads by branch, then by leaf, each level in ascending bucket order and each leaf in frontier order. */
async function bucketed(crypto: CryptoPort, heads: readonly FrontierHead[]): Promise<Buckets> {
  const branches = new Map<number, Map<number, string[]>>();
  for (const { writer, head } of heads) {
    const bucket = await FrontierAnchorBucket.of(crypto, writer);
    const leaves = branches.get(bucket.branch) ?? new Map<number, string[]>();
    branches.set(bucket.branch, leaves);
    const leaf = leaves.get(bucket.leaf) ?? [];
    leaves.set(bucket.leaf, leaf);
    leaf.push(head);
  }
  return new Map([...branches].sort(byBucket).map(([branch, leaves]) => [branch, new Map([...leaves].sort(byBucket))]));
}

function byBucket<T>(left: readonly [number, T], right: readonly [number, T]): number {
  return left[0] - right[0];
}
