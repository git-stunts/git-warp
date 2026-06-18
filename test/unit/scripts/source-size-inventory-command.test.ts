import { spawnSync, type SpawnSyncOptionsWithStringEncoding, type SpawnSyncReturns } from 'node:child_process';
import { describe, expect, it } from 'vitest';

type InventoryEntry = {
  readonly lines: number;
  readonly path: string;
};

const COMMAND_TIMEOUT_MS = 120_000;
const SOURCE_FILE_LOC_CEILING = 500;
const TEST_FILE_LOC_CEILING = 800;
const LINE_INVENTORY_COMMAND = [
  "find src bin scripts test/unit test/conformance -path '*/node_modules/*' -prune -o",
  "-type f \\( -name '*.ts' -o -name '*.js' -o -name '*.sh' \\) -print0",
  '| xargs -0 wc -l',
].join(' ');

type CommandRunner = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding,
) => SpawnSyncReturns<string>;

type SpawnCall = {
  readonly command: string;
  readonly args: readonly string[];
  readonly timeout: SpawnSyncOptionsWithStringEncoding['timeout'];
  readonly killSignal: SpawnSyncOptionsWithStringEncoding['killSignal'];
};

const defaultCommandRunner: CommandRunner = (command, args, options) => spawnSync(command, [...args], options);

const SOURCE_OVER_BUDGET_PATHS = Object.freeze([
  'src/domain/RuntimeHost.ts',
  'src/domain/orset/trie/TrieCursor.ts',
  'src/domain/services/JoinReducerSession.ts',
  'src/domain/services/audit/AuditChainVerifier.ts',
  'src/domain/services/controllers/CheckpointController.ts',
  'src/domain/services/optic/CheckpointBasisManifest.ts',
  'src/domain/services/optic/CheckpointShardFactReader.ts',
  'src/domain/services/state/WarpState.ts',
]);

const STRAND_SERVICE_TEST_PATH = 'test/unit/domain/services/strand/StrandService.test.ts';

function runLineInventory(runner: CommandRunner = defaultCommandRunner): readonly InventoryEntry[] {
  const result = runner('sh', [
    '-c',
    LINE_INVENTORY_COMMAND,
  ], {
    encoding: 'utf8',
    timeout: COMMAND_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.endsWith(' total'))
    .map(parseInventoryLine);
}

function parseInventoryLine(line: string): InventoryEntry {
  const match = /^(\d+)\s+(.+)$/u.exec(line);
  if (match === null) {
    throw new SourceInventoryError(`unparseable inventory line: ${line}`);
  }
  const lineCount = Number(match[1]);
  const path = match[2];
  if (!Number.isInteger(lineCount) || lineCount <= 0 || path === undefined) {
    throw new SourceInventoryError(`invalid inventory line: ${line}`);
  }
  return { lines: lineCount, path };
}

class SourceInventoryError extends Error {}

function successfulSpawnResult(stdout: string): SpawnSyncReturns<string> {
  return {
    pid: 0,
    output: [null, stdout, ''],
    stdout,
    stderr: '',
    status: 0,
    signal: null,
  };
}

function byInventoryPath(a: InventoryEntry, b: InventoryEntry): number {
  if (a.path < b.path) {
    return -1;
  }
  if (a.path > b.path) {
    return 1;
  }
  return 0;
}

function requireInventoryEntry(
  entries: readonly InventoryEntry[],
  path: string,
): InventoryEntry {
  const entry = entries.find((candidate) => candidate.path === path);
  if (entry === undefined) {
    throw new SourceInventoryError(`missing inventory entry: ${path}`);
  }
  return entry;
}

describe('source size inventory command', () => {
  it('bounds the inventory subprocess with a timeout', () => {
    const calls: SpawnCall[] = [];
    const recordingRunner: CommandRunner = (command, args, options) => {
      calls.push({
        command,
        args: [...args],
        timeout: options.timeout,
        killSignal: options.killSignal,
      });
      return successfulSpawnResult('1 src/index.ts\n');
    };

    runLineInventory(recordingRunner);

    expect(calls).toEqual([{
      command: 'sh',
      args: ['-c', LINE_INVENTORY_COMMAND],
      timeout: COMMAND_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    }]);
  });

  it('reports the current source files over the 500 LOC ceiling', () => {
    const entries = runLineInventory();
    const sourceOverBudget = entries
      .filter((entry) => entry.path.startsWith('src/') && entry.lines > SOURCE_FILE_LOC_CEILING)
      .sort(byInventoryPath);

    expect(sourceOverBudget.map((entry) => entry.path)).toEqual(SOURCE_OVER_BUDGET_PATHS);
    for (const entry of sourceOverBudget) {
      expect(entry.lines).toBeGreaterThan(SOURCE_FILE_LOC_CEILING);
    }
  });

  it('keeps test-file overages visible as inventory, not closeout prose', () => {
    const entries = runLineInventory();
    const testOverBudget = entries
      .filter((entry) => entry.path.startsWith('test/') && entry.lines > TEST_FILE_LOC_CEILING)
      .sort(byInventoryPath);
    const strandServiceTest = requireInventoryEntry(testOverBudget, STRAND_SERVICE_TEST_PATH);

    expect(strandServiceTest.lines).toBeGreaterThan(TEST_FILE_LOC_CEILING);
  });

  it('rejects zero-line rows as invalid policy inventory evidence', () => {
    expect(() => parseInventoryLine('0 src/empty.ts')).toThrow(SourceInventoryError);
  });
});
