import { describe, expect, it } from 'vitest';
import packageJson from '../../../package.json' with { type: 'json' };
import publishTsconfig from '../../../tsconfig.publish.json' with { type: 'json' };
import InMemoryGraphAdapter from '../../../test/helpers/InMemoryGraphAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { CURRENT_CHECKPOINT_SCHEMA } from '../../../src/domain/services/state/checkpointHelpers.ts';
import {
  formatHumanResult,
  parseArgs,
  upgradeV16ToV17,
} from '../../../scripts/upgrade-v16-to-v17.ts';
import { parseUpgradeCommandEntrypoint } from '../../helpers/parseUpgradeCommandEntrypoint.ts';

function oid(hex: string): string {
  return hex.repeat(40).slice(0, 40);
}

describe('v16 to v17 top-level upgrade utility', () => {
  it('parses repeated graph names and defaults repo to cwd', () => {
    const args = parseArgs([
      '--graph', 'alpha',
      '--graph', 'beta',
      '--dry-run',
      '--json',
    ], '/repo');

    expect(args.repo).toBe('/repo');
    expect(args.graphNames).toEqual(['alpha', 'beta']);
    expect(args.dryRun).toBe(true);
    expect(args.json).toBe(true);
  });

  it('rejects a missing repo path when the next token is another flag', () => {
    expect(() => parseArgs(['--repo', '--dry-run'], '/repo'))
      .toThrow('--repo requires a path');
  });

  it('rejects a missing graph name when the next token is another flag', () => {
    expect(() => parseArgs(['--graph', '--json'], '/repo'))
      .toThrow('--graph requires a graph name');
  });

  it('dry-runs rebuildable cache ref deletion without moving refs', async () => {
    const persistence = new InMemoryGraphAdapter();
    await persistence.updateRef('refs/warp/alpha/coverage/head', oid('a'));
    await persistence.updateRef('refs/warp/alpha/seek-cache', oid('b'));

    const result = await upgradeV16ToV17({
      persistence,
      graphNames: ['alpha'],
      dryRun: true,
    });

    expect(result.graphs[0]?.checkpoint.status).toBe('missing-checkpoint');
    expect(result.graphs[0]?.cacheRefs).toEqual([
      { ref: 'refs/warp/alpha/coverage/head', action: 'would-delete', previousOid: oid('a') },
      { ref: 'refs/warp/alpha/seek-cache', action: 'would-delete', previousOid: oid('b') },
    ]);
    expect(await persistence.readRef('refs/warp/alpha/coverage/head')).toBe(oid('a'));
    expect(await persistence.readRef('refs/warp/alpha/seek-cache')).toBe(oid('b'));
  });

  it('deletes rebuildable cache refs while leaving checkpoint refs under checkpoint migration control', async () => {
    const persistence = new InMemoryGraphAdapter();
    const checkpointSha = await persistence.commitNode({
      message: DEFAULT_COMMIT_MESSAGE_CODEC.encodeCheckpoint({
        kind: 'checkpoint',
        graph: 'alpha',
        stateHash: '0'.repeat(64),
        schema: CURRENT_CHECKPOINT_SCHEMA,
        checkpointVersion: null,
      }),
      parents: [],
    });
    await persistence.updateRef('refs/warp/alpha/checkpoints/head', checkpointSha);
    await persistence.updateRef('refs/warp/alpha/coverage/head', oid('a'));
    await persistence.updateRef('refs/warp/alpha/seek-cache', oid('b'));

    const result = await upgradeV16ToV17({
      persistence,
      graphNames: ['alpha'],
    });

    expect(result.graphs[0]?.cacheRefs.map((entry) => entry.action)).toEqual(['deleted', 'deleted']);
    expect(await persistence.readRef('refs/warp/alpha/coverage/head')).toBeNull();
    expect(await persistence.readRef('refs/warp/alpha/seek-cache')).toBeNull();
    expect(await persistence.readRef('refs/warp/alpha/checkpoints/head')).toBe(checkpointSha);
  });

  it('formats an empty repo without implying an error', () => {
    expect(formatHumanResult({ dryRun: true, graphCount: 0, graphs: [] }))
      .toBe('No WARP graphs found in this repository.');
  });

  it('wires npm run upgrade through the top-level operator script', () => {
    expect(parseUpgradeCommandEntrypoint(packageJson.scripts.upgrade)).toBe('dist/scripts/upgrade-v16-to-v17.js');
    expect(publishTsconfig.include).toContain('scripts/**/*.ts');
    expect(packageJson.files).toContain('dist');
  });
});
