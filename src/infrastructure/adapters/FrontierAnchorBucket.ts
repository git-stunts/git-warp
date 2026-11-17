import type CryptoPort from '../../ports/CryptoPort.ts';

/** Buckets on each level of the frontier anchors, and the most heads or anchors one anchor names besides its link. */
export const FRONTIER_ANCHOR_FANOUT = 63;
/** The version of the bucket function. Changing the function changes every anchor, so a new function takes a new version. */
export const FRONTIER_ANCHOR_BUCKET_VERSION = 1;

const DOMAIN = `git-warp frontier anchor bucket\nversion ${FRONTIER_ANCHOR_BUCKET_VERSION}\n`;
const HASH_ALGORITHM = 'sha256';
/** Hex digits of the digest that choose one level's bucket: 32 bits, so the remainder modulo 63 is near uniform. */
const HEX_PER_LEVEL = 8;
const BRANCH_LEVEL = 0;
const LEAF_LEVEL = 1;

/**
 * Where a writer's head sits among the frontier anchors (#1197): one of 63 branches and one
 * of 63 leaves in it. Version 1 takes the SHA-256 of `git-warp frontier anchor bucket`, a
 * newline, `version 1`, a newline and the writer ID; the branch is its first 32 bits
 * modulo 63 and the leaf its next 32 bits modulo 63. Nothing else enters, so every clone
 * puts a writer in the same bucket, and a writer stays in its bucket as its head moves.
 */
export default class FrontierAnchorBucket {
  readonly branch: number;
  readonly leaf: number;

  private constructor(branch: number, leaf: number) {
    this.branch = branch;
    this.leaf = leaf;
    Object.freeze(this);
  }

  static async of(crypto: CryptoPort, writer: string): Promise<FrontierAnchorBucket> {
    const digest = await crypto.hash(HASH_ALGORITHM, `${DOMAIN}${writer}`);
    return new FrontierAnchorBucket(levelOf(digest, BRANCH_LEVEL), levelOf(digest, LEAF_LEVEL));
  }
}

function levelOf(digest: string, level: number): number {
  return Number.parseInt(digest.slice(level * HEX_PER_LEVEL, (level + 1) * HEX_PER_LEVEL), 16) % FRONTIER_ANCHOR_FANOUT;
}
