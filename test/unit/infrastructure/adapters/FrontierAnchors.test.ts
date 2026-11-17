import { describe, expect, it } from 'vitest';
import PersistenceError from '../../../../src/domain/errors/PersistenceError.ts';
import FrontierAnchorBucket, { FRONTIER_ANCHOR_FANOUT } from '../../../../src/infrastructure/adapters/FrontierAnchorBucket.ts';
import FrontierAnchorPlan, { type FrontierAnchor, type FrontierHead } from '../../../../src/infrastructure/adapters/FrontierAnchorPlan.ts';
import GitFastImportCommitWriter, { FAST_IMPORT_ANCHOR_BATCH } from '../../../../src/infrastructure/adapters/GitFastImportCommitWriter.ts';
import GitObjectFormat from '../../../../src/infrastructure/adapters/GitObjectFormat.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import ObservationBasisFrontier from '../../../../src/infrastructure/adapters/ObservationBasisFrontier.ts';
import ObservationHistoryDigest from '../../../../src/infrastructure/adapters/ObservationHistoryDigest.ts';
import ObservationWorkMeter from '../../../../src/infrastructure/adapters/ObservationWorkMeter.ts';
import ObservationSupportLimits from '../../../../src/domain/services/custody/ObservationSupportLimits.ts';
import ConeFrontier from '../../../../src/domain/services/cone/ConeFrontier.ts';
import ConeWriterPosition from '../../../../src/domain/services/cone/ConeWriterPosition.ts';
import ConeFrontierCborCodec from '../../../../src/infrastructure/adapters/ConeFrontierCborCodec.ts';
import CryptoPort from '../../../../src/ports/CryptoPort.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { createRng } from '../../../helpers/seededRng.ts';

const crypto = new NodeCryptoAdapter();
const LANE = 'todos';
/** Seeds for the generated frontiers; a failing case names its seed in the test title. */
const SEEDS = [1197, 4096, 20261117];

function headOf(index: number, length = 40): string {
  return index.toString(16).padStart(length, '0');
}

function frontierOf(count: number, offset = 0): FrontierHead[] {
  return Array.from({ length: count }, (_unused, index) => ({ writer: `w${String(index + offset).padStart(6, '0')}`, head: headOf(index + offset + 1) }));
}

async function planOf(heads: readonly FrontierHead[], hashing: CryptoPort = crypto): Promise<FrontierAnchorPlan> {
  return await FrontierAnchorPlan.of({ crypto: hashing, lane: LANE, format: GitObjectFormat.SHA1, heads });
}

/** Real hashing, except that every writer falls in one bucket: the way to make one leaf hold more than 63 heads. */
class OneBucketCrypto extends CryptoPort {
  override async hash(algorithm: string, data: string | Uint8Array): Promise<string> {
    return typeof data === 'string' && data.startsWith('git-warp frontier anchor bucket')
      ? await Promise.resolve('0'.repeat(64))
      : await crypto.hash(algorithm, data);
  }

  override async hmac(algorithm: string, key: string | Uint8Array, data: string | Uint8Array): Promise<Uint8Array> {
    return await crypto.hmac(algorithm, key, data);
  }

  override timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    return crypto.timingSafeEqual(a, b);
  }
}

/** The heads that leaf anchors name, in plan order: what the plan retains. */
function leafHeads(plan: FrontierAnchorPlan): string[] {
  const anchors = new Set(plan.anchors.map((anchor) => anchor.oid));
  return plan.anchors.filter((anchor) => anchor.message.includes('/')).flatMap((anchor) => anchor.parents.filter((parent) => !anchors.has(parent)));
}

describe('FrontierAnchorBucket, version 1', () => {
  // Oracle: the specified function, SHA-256 of the domain line and the writer ID, 32 bits per level, modulo 63.
  it.each([
    ['alice', 30, 26],
    ['pool-0001', 25, 4],
    ['w000000', 59, 26],
    ['@w.alice@s.strand', 23, 21],
  ])('puts %s in branch %i, leaf %i on every clone', async (writer, branch, leaf) => {
    const bucket = await FrontierAnchorBucket.of(crypto, writer);

    expect([bucket.branch, bucket.leaf]).toEqual([branch, leaf]);
  });

  it('keeps every bucket below the fan-out of 63', async () => {
    const buckets = await Promise.all(frontierOf(2000).map(async ({ writer }) => await FrontierAnchorBucket.of(crypto, writer)));

    expect(FRONTIER_ANCHOR_FANOUT).toBe(63);
    expect(buckets.every((bucket) => bucket.branch < 63 && bucket.leaf < 63 && bucket.branch >= 0 && bucket.leaf >= 0)).toBe(true);
  });
});

describe('GitObjectFormat', () => {
  // Oracle: Git's empty tree ids for each object format.
  it('names the format of a sha1 or sha256 id, and no other string', () => {
    expect(GitObjectFormat.ofOid('a'.repeat(40))).toBe(GitObjectFormat.SHA1);
    expect(GitObjectFormat.ofOid('a'.repeat(64))).toBe(GitObjectFormat.SHA256);
    expect([GitObjectFormat.ofOid('A'.repeat(40)), GitObjectFormat.ofOid('a'.repeat(41)), GitObjectFormat.ofOid('')]).toEqual([null, null, null]);
    expect([GitObjectFormat.SHA1.emptyTree, GitObjectFormat.SHA256.emptyTree]).toEqual([
      '4b825dc642cb6eb9a060e54bf8d69288fbee4904', '6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321',
    ]);
  });
});

describe('ObservationHistoryDigest', () => {
  // Oracle: the #1067 carrier digest, a seed then a roll over batches of 63 heads, as main computed it before #1197.
  it('keeps the digest that custody bound before frontier anchors', async () => {
    const digest = new ObservationHistoryDigest(crypto);
    const heads = Array.from({ length: 64 }, (_unused, index) => String(index).padStart(40, 'a'));

    expect((await digest.of([])).hex).toBe('26326c2c179e7fdf4ff2a0b13e482a3137631df94ddb8666eb92d66af0557b4a');
    expect((await digest.of(heads)).hex).toBe('ce1f6ec0f10d86e841651fd3b04adb34c5615d6fb1b4a3e4dd12a11d263bc05d');
  });
});

describe('FrontierAnchorPlan', () => {
  it('plans nothing for a frontier with no heads', async () => {
    const plan = await planOf([]);

    expect([plan.anchors, plan.tops]).toEqual([[], []]);
  });

  it('names each head once, in leaf anchors of at most 63 heads, under at most 63 branch anchors', async () => {
    const heads = frontierOf(4097);
    const plan = await planOf(heads);

    expect(leafHeads(plan).sort()).toEqual(heads.map(({ head }) => head).sort());
    expect(plan.tops.length).toBeLessThanOrEqual(63);
    expect(plan.anchors.every((anchor) => anchor.parents.length <= 64)).toBe(true);
  });

  it('chains a leaf that holds more than 63 heads, each link naming the one before', async () => {
    const heads = frontierOf(130);
    const plan = await planOf(heads, new OneBucketCrypto());
    const [first, second, third, branch] = plan.anchors;

    expect(plan.anchors.map((anchor) => anchor.parents.length)).toEqual([63, 64, 5, 1]);
    expect([second?.parents[0], third?.parents[0], branch?.parents[0]]).toEqual([first?.oid, second?.oid, third?.oid]);
    expect(third?.message).toContain('heads 130\n');
    expect(plan.tops).toEqual([branch?.oid]);
  });

  it('writes a canonical message naming the lane, the bucket, the count and the digest', async () => {
    const plan = await planOf(frontierOf(1));
    const [leaf, branch] = plan.anchors;

    expect(leaf?.message).toMatch(/^git-warp frontier anchor\nversion 1\nlane todos\nbucket 59\/26\nheads 1\ndigest [0-9a-f]{64}\n$/u);
    expect(branch?.message).toMatch(/^git-warp frontier anchor\nversion 1\nlane todos\nbucket 59\nheads 1\ndigest [0-9a-f]{64}\n$/u);
  });

  it('gives a sha256 frontier sha256 anchor ids', async () => {
    const plan = await FrontierAnchorPlan.of({ crypto, lane: LANE, format: GitObjectFormat.SHA256, heads: [{ writer: 'w', head: headOf(1, 64) }] });

    expect(plan.anchors.every((anchor) => GitObjectFormat.ofOid(anchor.oid) === GitObjectFormat.SHA256)).toBe(true);
  });

  it.each(SEEDS)('changes only the moved writer\'s leaf and branch anchors near 4,096 writers (seed %i)', async (seed) => {
    const rng = createRng(seed);
    const heads = frontierOf(rng.nextInt(4000, 4200));
    const moved = rng.nextInt(0, heads.length);
    const before = await planOf(heads);
    const after = await planOf(heads.map((named, index) => (index === moved ? { ...named, head: headOf(10_000_000 + seed) } : named)));
    const known = new Set(before.anchors.map((anchor) => anchor.oid));

    const added = after.anchors.filter((anchor) => !known.has(anchor.oid));

    expect(added).toHaveLength(2);
    expect(after.anchors).toHaveLength(before.anchors.length);
    expect(await planOf(heads)).toEqual(before);
  });
});

describe('GitFastImportCommitWriter', () => {
  const anchor = (oid: string, parents: readonly string[]): FrontierAnchor => ({ oid, parents, message: `anchor ${oid}\n` });

  function writerOver(answer: (script: string) => Promise<string>): { readonly writer: GitFastImportCommitWriter; readonly scripts: string[] } {
    const scripts: string[] = [];
    const writer = new GitFastImportCommitWriter({
      plumbing: {
        execute: async (options) => {
          const script = String(options.input);
          scripts.push(script);
          return await answer(script);
        },
      },
    });
    return { writer, scripts };
  }

  it('starts no process when every anchor exists', async () => {
    const { writer, scripts } = writerOver(async () => await Promise.resolve(''));

    await writer.write([]);

    expect(scripts).toEqual([]);
  });

  it('names an anchor written in the same call by its mark, and any other parent by its id', async () => {
    const leaf = anchor('1'.repeat(40), ['a'.repeat(40), 'b'.repeat(40)]);
    const branch = anchor('2'.repeat(40), [leaf.oid, 'c'.repeat(40)]);
    const { writer, scripts } = writerOver(async () => await Promise.resolve(`${leaf.oid}\n${branch.oid}\n`));

    await writer.write([leaf, branch]);

    expect(scripts[0]).toContain(`from ${'a'.repeat(40)}\nmerge ${'b'.repeat(40)}\ndeleteall\n`);
    expect(scripts[0]).toContain(`from :1\nmerge ${'c'.repeat(40)}\ndeleteall\n`);
    expect(scripts[0]?.endsWith('reset refs/warp-local/frontier-anchor-build\n\nget-mark :1\nget-mark :2\ndone\n')).toBe(true);
  });

  it('writes at most 64 anchors in one process, naming an earlier batch\'s anchor by its id', async () => {
    const anchors = Array.from({ length: 65 }, (_unused, index) => anchor(String(index + 1).padStart(40, '1'), [index === 0 ? 'a'.repeat(40) : String(index).padStart(40, '1')]));
    const { writer, scripts } = writerOver(async (script) => await Promise.resolve(
      anchors.filter((candidate) => script.includes(`data ${`anchor ${candidate.oid}\n`.length}\nanchor ${candidate.oid}\n`)).map((candidate) => candidate.oid).join('\n'),
    ));

    await writer.write(anchors);

    expect(FAST_IMPORT_ANCHOR_BATCH).toBe(64);
    expect(scripts.map((script) => script.split('\ncommit ').length - 1)).toEqual([64, 1]);
    expect(scripts[1]).toContain(`from ${anchors[63]?.oid ?? ''}\ndeleteall\n`);
  });

  it.each([
    ['another id', '9'.repeat(40)],
    ['no id', ''],
  ])('refuses a write where Git reports %s for an anchor', async (_name, reported) => {
    const { writer } = writerOver(async () => await Promise.resolve(reported));

    await expect(writer.write([anchor('1'.repeat(40), ['a'.repeat(40)])])).rejects.toBeInstanceOf(PersistenceError);
  });

  it('surfaces a failed fast-import as a Git error', async () => {
    const failure = Object.assign(new Error('fast-import failed'), { details: { code: 128, stderr: 'fatal: bad object' } });
    const { writer } = writerOver(async () => await Promise.reject(failure));

    await expect(writer.write([anchor('1'.repeat(40), ['a'.repeat(40)])])).rejects.toThrow();
  });
});

describe('ObservationBasisFrontier heads', () => {
  const FRONTIER = 'e'.repeat(40);
  const frontiers = new ConeFrontierCborCodec(codec);

  function readerOver(frontier: ConeFrontier, entryOid = FRONTIER): ObservationBasisFrontier {
    const bytes = frontiers.encode(frontier);
    return new ObservationBasisFrontier({
      history: {
        plumbing: { execute: async (options) => await Promise.resolve(options.args[1] === '-s' ? String(bytes.length) : 'tree') },
        readBlob: async () => await Promise.resolve(bytes),
        readTreeObjectEntries: async () => await Promise.resolve([{ name: 'frontier', mode: '100644', type: 'blob', oid: entryOid }]),
      },
      codec,
      limits: new ObservationSupportLimits({ dependencies: 1, frontierBytes: 1024 * 1024, work: 100 }),
    });
  }

  function frontierNaming(positions: ReadonlyArray<readonly [string, string]>): ConeFrontier {
    return new ConeFrontier(new Map(positions.map(([writer, head]) => [writer, new ConeWriterPosition(head, 1)])));
  }

  it('names each head once, with the first writer that names it, in writer-id order', async () => {
    const shared = 'a'.repeat(40);
    const heads = await readerOver(frontierNaming([['carol', 'b'.repeat(40)], ['bob', shared], ['alice', shared]])).heads(FRONTIER, new ObservationWorkMeter(100));

    expect(heads).toEqual({ format: GitObjectFormat.SHA1, heads: [{ writer: 'alice', head: shared }, { writer: 'carol', head: 'b'.repeat(40) }] });
  });

  it.each([
    ['a head of another object format', frontierNaming([['alice', 'a'.repeat(64)]]), FRONTIER],
    ['a frontier entry whose id is no object id', frontierNaming([['alice', 'a'.repeat(40)]]), 'not-an-id'],
  ])('calls a basis with %s corrupt', async (_name, frontier, entryOid) => {
    expect(await readerOver(frontier, entryOid).heads(FRONTIER, new ObservationWorkMeter(100))).toBe('corrupt');
  });
});
