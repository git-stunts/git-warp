import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import QueryError from '../../../src/domain/errors/QueryError.ts';
import { EXIT_CODES } from '../../../bin/cli/infrastructure.ts';

vi.mock('../../../bin/cli/shared.ts', () => ({
  createPersistence: vi.fn(),
  resolveGraphName: vi.fn(),
  listGraphNames: vi.fn(),
}));

vi.mock('../../../legacy.ts', () => ({
  openWarpWorldline: vi.fn(),
}));

const shared = await import('../../../bin/cli/shared.ts');
const api = await import('../../../legacy.ts');
const createPersistence = shared.createPersistence as ReturnType<typeof vi.fn>;
const resolveGraphName = shared.resolveGraphName as ReturnType<typeof vi.fn>;
const listGraphNames = shared.listGraphNames as ReturnType<typeof vi.fn>;
const openWarpWorldline = api.openWarpWorldline as ReturnType<typeof vi.fn>;
const { default: handleOptic } = await import('../../../bin/cli/commands/optic.ts');

const CLI_OPTIONS = {
  repo: '/tmp/repo',
  graph: 'demo',
  json: true,
  ndjson: false,
  view: null,
  writer: 'cli',
  help: false,
};

const CHECKPOINT_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const READ_IDENTITY = Object.freeze({
  kind: 'checkpoint-tail-read',
  basis: 'checkpointReadBasis+tailWitnesses',
  worldline: 'demo',
  entityAspect: 'node:node:a:prop:title',
  checkpointSha: CHECKPOINT_SHA,
  checkpointFrontier: Object.freeze([
    Object.freeze({ writerId: 'alice', patchSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }),
  ]),
  checkpointIndexShards: Object.freeze([
    Object.freeze({ path: 'props_12.cbor', oid: 'cccccccccccccccccccccccccccccccccccccccc' }),
  ]),
  tailWitnesses: Object.freeze([
    Object.freeze({ sha: 'dddddddddddddddddddddddddddddddddddddddd', writerId: 'alice', lamport: 3 }),
  ]),
  reducerVersion: 'checkpoint-tail-locator',
  projectionVersion: 'optic-read-foundation',
});

describe('optic command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createPersistence.mockResolvedValue({ persistence: { kind: 'persistence' } });
    resolveGraphName.mockResolvedValue('demo');
    listGraphNames.mockResolvedValue(['demo']);
  });

  it('emits a complete node-property witness with basis and shard evidence', async () => {
    const propertyRead = vi.fn().mockResolvedValue({
      nodeId: 'node:a',
      key: 'title',
      exists: true,
      value: 'hello',
      readIdentity: READ_IDENTITY,
    });
    openWarpWorldline.mockResolvedValue({
      prepareOpticBasis: vi.fn().mockResolvedValue({
        worldlineName: 'demo',
        checkpointSha: CHECKPOINT_SHA,
      }),
      coordinate: vi.fn().mockResolvedValue({
        optic: () => ({
          node: () => ({
            read: vi.fn(),
            prop: () => ({ read: propertyRead }),
          }),
        }),
      }),
    });

    const result = await handleOptic({
      options: CLI_OPTIONS,
      args: ['witness', 'node:a', '--property', 'title'],
    });

    expect(result.exitCode).toBe(EXIT_CODES.OK);
    expect(result.payload).toMatchObject({
      command: 'optic witness',
      graph: 'demo',
      basisId: `checkpoint-tail:demo:${CHECKPOINT_SHA}`,
      checkpointSha: CHECKPOINT_SHA,
      completeness: 'complete',
      obstruction: null,
      selection: { nodeId: 'node:a', propertyKey: 'title' },
      read: {
        kind: 'node-property',
        nodeId: 'node:a',
        key: 'title',
        exists: true,
        value: 'hello',
      },
      evidence: {
        touchedShardIds: [
          { path: 'props_12.cbor', oid: 'cccccccccccccccccccccccccccccccccccccccc' },
        ],
        tailWitnessRange: {
          count: 1,
          first: { sha: 'dddddddddddddddddddddddddddddddddddddddd', writerId: 'alice', lamport: 3 },
          last: { sha: 'dddddddddddddddddddddddddddddddddddddddd', writerId: 'alice', lamport: 3 },
        },
        tailWitnesses: [
          { sha: 'dddddddddddddddddddddddddddddddddddddddd', writerId: 'alice', lamport: 3 },
        ],
      },
    });
    expect(propertyRead).toHaveBeenCalled();
  });

  it('emits obstruction payloads for bounded-basis failures', async () => {
    openWarpWorldline.mockResolvedValue({
      prepareOpticBasis: vi.fn().mockRejectedValue(new QueryError('No bounded basis.', {
        code: 'E_OPTIC_NO_BOUNDED_BASIS',
        context: { reason: 'missing-checkpoint' },
      })),
      coordinate: vi.fn(),
    });

    const result = await handleOptic({
      options: CLI_OPTIONS,
      args: ['witness', 'node:a'],
    });

    expect(result.exitCode).toBe(EXIT_CODES.INTERNAL);
    expect(result.payload).toMatchObject({
      command: 'optic witness',
      graph: 'demo',
      basisId: null,
      checkpointSha: null,
      completeness: 'obstructed',
      obstruction: {
        code: 'E_OPTIC_NO_BOUNDED_BASIS',
        message: 'No bounded basis.',
        context: { reason: 'missing-checkpoint' },
      },
      evidence: {
        touchedShardIds: [],
        tailWitnessRange: { count: 0, first: null, last: null },
        tailWitnesses: [],
      },
    });
  });

  it('preserves prepared basis evidence when a shard read is obstructed', async () => {
    openWarpWorldline.mockResolvedValue({
      prepareOpticBasis: vi.fn().mockResolvedValue({
        worldlineName: 'demo',
        checkpointSha: CHECKPOINT_SHA,
      }),
      coordinate: vi.fn().mockResolvedValue({
        optic: () => ({
          node: () => ({
            read: vi.fn().mockRejectedValue(new QueryError('Shard unavailable.', {
              code: 'E_OPTIC_NO_BOUNDED_BASIS',
              context: { reason: 'checkpoint-shard-unavailable' },
            })),
          }),
        }),
      }),
    });

    const result = await handleOptic({
      options: CLI_OPTIONS,
      args: ['witness', 'node:a'],
    });

    expect(result.exitCode).toBe(EXIT_CODES.INTERNAL);
    expect(result.payload).toMatchObject({
      graph: 'demo',
      basisId: `checkpoint-tail:demo:${CHECKPOINT_SHA}`,
      checkpointSha: CHECKPOINT_SHA,
      completeness: 'obstructed',
      obstruction: {
        code: 'E_OPTIC_NO_BOUNDED_BASIS',
        context: { reason: 'checkpoint-shard-unavailable' },
      },
    });
  });

  it('keeps the operator witness path off materialization-era read APIs', () => {
    const source = readFileSync('bin/cli/commands/optic.ts', 'utf8');

    expect(source).not.toContain('.materialize(');
    expect(source).not.toContain('openGraph');
    expect(source).not.toContain('getNodes(');
    expect(source).not.toContain('getEdges(');
  });
});
