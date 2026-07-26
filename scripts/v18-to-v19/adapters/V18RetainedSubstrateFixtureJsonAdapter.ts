import z from 'zod';

const gitOid = z.string().regex(/^[0-9a-f]{40}$/u);
const packageEvidence = z.object({
  integrity: z.string().startsWith('sha512-'),
  version: z.string().min(1),
}).strict();
const writerRef = z.object({
  expectedHead: gitOid,
  expectedObjectType: z.literal('commit'),
  kind: z.literal('writer'),
  patchCount: z.number().int().positive(),
  refName: z.string().startsWith('refs/warp/'),
  writerId: z.string().min(1),
}).strict();
const stateCacheRef = z.object({
  expectedHead: gitOid,
  expectedObjectType: z.literal('blob'),
  kind: z.literal('state-cache'),
  refName: z.string().startsWith('refs/warp/'),
}).strict();

export const V18RetainedSubstrateFixtureManifestSchema = z.object({
  bundlePath: z.string().min(1),
  bundleSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  fixtureId: z.string().min(1),
  graphId: z.string().min(1),
  refs: z.array(z.discriminatedUnion('kind', [
    writerRef,
    stateCacheRef,
  ])).min(2),
  retainedState: z.object({
    payloadRoot: gitOid,
    payloadRootObjectType: z.literal('tree'),
    refName: z.string().startsWith('refs/warp/'),
    schemaVersion: z.literal(1),
    snapshotId: z.string().startsWith('snapshot:'),
    stateHash: z.string().regex(/^[0-9a-f]{64}$/u),
  }).strict(),
  source: z.object({
    gitCas: packageEvidence,
    gitWarp: packageEvidence,
    plumbing: packageEvidence,
  }).strict(),
  visibleFacts: z.array(z.object({
    description: z.string().min(1),
    key: z.string().min(1),
    kind: z.enum([
      'content',
      'edge',
      'edge-property',
      'multi-writer',
      'node',
      'property',
    ]),
  }).strict()).min(1),
}).strict();

export type V18RetainedSubstrateFixtureManifest = Readonly<
  z.infer<typeof V18RetainedSubstrateFixtureManifestSchema>
>;

const retainedStateCache = z.object({
  schemaVersion: z.literal(1),
  snapshots: z.record(z.string(), z.object({
    payloadRef: gitOid,
    snapshotId: z.string().startsWith('snapshot:'),
    stateHash: z.string().regex(/^[0-9a-f]{64}$/u),
  }).passthrough()),
}).passthrough();

export type V18RetainedStateCache = Readonly<
  z.infer<typeof retainedStateCache>
>;

export function parseV18RetainedSubstrateFixtureManifestJson(
  text: string,
): V18RetainedSubstrateFixtureManifest {
  const value: unknown = JSON.parse(text);
  return Object.freeze(V18RetainedSubstrateFixtureManifestSchema.parse(value));
}

export function parseV18RetainedStateCacheJson(
  text: string,
): V18RetainedStateCache {
  const value: unknown = JSON.parse(text);
  return Object.freeze(retainedStateCache.parse(value));
}
