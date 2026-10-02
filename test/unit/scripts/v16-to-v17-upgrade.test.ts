import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import packageJson from '../../../package.json' with { type: 'json' };
import publishTsconfig from '../../../tsconfig.publish.json' with { type: 'json' };
import InMemoryGraphAdapter from '../../../test/helpers/InMemoryGraphAdapter.ts';
import MemoryRuntimeStorageAdapter from '../../helpers/MemoryRuntimeStorageAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import { createEmptyState } from '../../../src/domain/services/JoinReducer.ts';
import { createFrontier } from '../../../src/domain/services/Frontier.ts';
import { createCheckpointEnvelope } from '../../../src/domain/services/state/checkpointCreate.ts';
import {
  formatHumanResult,
  parseArgs,
  upgradeV16ToV17,
} from '../../../scripts/upgrade-v16-to-v17.ts';
import { parseUpgradeCommandEntrypoint } from '../../helpers/parseUpgradeCommandEntrypoint.ts';
import retainUnavailableMaterialization from '../../helpers/retainUnavailableMaterialization.ts';

function oid(hex: string): string {
  return hex.repeat(40).slice(0, 40);
}

describe('v16 to v17 top-level upgrade utility', () => {
  it.each(['file', 'directory'])('executes help through a %s symlink', (kind) => {
    const root = mkdtempSync(join(tmpdir(), 'warp-upgrade-entry-'));
    const script = fileURLToPath(new URL('../../../scripts/upgrade-v16-to-v17.ts', import.meta.url));
    try {
      const link = join(root, kind === 'file' ? 'upgrade.ts' : 'scripts');
      symlinkSync(kind === 'file' ? script : fileURLToPath(new URL('../../../scripts/', import.meta.url)), link);
      const invoked = kind === 'file' ? link : join(link, 'upgrade-v16-to-v17.ts');
      const result = spawnSync(process.execPath, [invoked, '--help'], { encoding: 'utf8', timeout: 10000 });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('--dry-run');
      expect(result.stderr).toBe('');
    } finally {
      rmSync(root, { recursive: true });
    }
  });

  it('runs direct help and stays inert when imported', () => {
    const scriptUrl = new URL('../../../scripts/upgrade-v16-to-v17.ts', import.meta.url);
    const direct = spawnSync(process.execPath, [fileURLToPath(scriptUrl), '--help'], { encoding: 'utf8', timeout: 10000 });
    expect(direct.error).toBeUndefined();
    expect(direct.status).toBe(0);
    expect(direct.stdout).toContain('Usage:');
    const imported = spawnSync(process.execPath, ['--input-type=module', '-e', 'await import(process.env.UPGRADE_ENTRY_URL);'], { encoding: 'utf8', timeout: 10000, env: { ...process.env, UPGRADE_ENTRY_URL: scriptUrl.href } });
    expect(imported.error).toBeUndefined();
    expect(imported.status).toBe(0);
    expect(imported.stdout).toBe('');
    expect(imported.stderr).toBe('');
  });

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
      runtimeStorage: new MemoryRuntimeStorageAdapter({ history: persistence }),
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
    const runtimeStorage = new MemoryRuntimeStorageAdapter({ history: persistence });
    const services = await runtimeStorage.createRuntimeStorageServices({
      timelineName: 'alpha',
      codec: defaultCodec,
      crypto: new NodeCryptoAdapter(),
      commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    });
    const state = createEmptyState();
    const frontier = createFrontier();
    const crypto = new NodeCryptoAdapter();
    const materialization = await retainUnavailableMaterialization({
      materializations: services.materializations,
      frontier,
      state,
      codec: defaultCodec,
      crypto,
    });
    const checkpointSha = await createCheckpointEnvelope({
      checkpointStore: services.checkpoints,
      graphName: 'alpha',
      state,
      frontier,
      codec: defaultCodec,
      crypto,
      materialization,
    });
    await persistence.updateRef('refs/warp/alpha/coverage/head', oid('a'));
    await persistence.updateRef('refs/warp/alpha/seek-cache', oid('b'));

    const result = await upgradeV16ToV17({
      persistence,
      runtimeStorage,
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
    expect(publishTsconfig.include).toContain('scripts/upgrade-v16-to-v17.ts');
    expect(packageJson.files).toContain('dist/scripts/upgrade-v16-to-v17.js');
    // The operator command is executable implementation; no public declaration
    // imports it, so the package publishes its JavaScript only.
    expect(packageJson.files).not.toContain('dist/scripts/upgrade-v16-to-v17.d.ts');
  });
});
