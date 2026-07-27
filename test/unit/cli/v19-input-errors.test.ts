import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import handleReceipt from '../../../bin/cli/commands/receipt.ts';
import handleSettle from '../../../bin/cli/commands/settle.ts';
import type { CliOptions } from '../../../bin/cli/types.ts';
import {
  intentFromText,
  intentFromValue,
  observerFromText,
} from '../../../bin/cli/v19/V19DomainInput.ts';
import {
  reviewedSettlementFromValue,
} from '../../../bin/cli/v19/V19SettlementReview.ts';
import { toMcpJson } from '../../../bin/presenters/V19Json.ts';

const temporaryDirectories: string[] = [];

const CLI_OPTIONS: CliOptions = {
  repo: '.',
  lane: 'users',
  strand: 'review',
  writer: 'test',
  writerExplicit: true,
  json: true,
  jsonl: false,
  help: false,
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('v19 CLI input errors', () => {
  it('normalizes malformed Intent and Observer JSON as usage errors', () => {
    expect(() => intentFromText('{')).toThrowError(
      expect.objectContaining({
        code: 'E_USAGE',
        message: expect.stringContaining('Invalid Intent JSON'),
      }),
    );
    expect(() => observerFromText('users.role', '{')).toThrowError(
      expect.objectContaining({
        code: 'E_USAGE',
        message: expect.stringContaining('Invalid Observer JSON'),
      }),
    );
  });

  it('normalizes invalid Intent and reviewed Settlement values', () => {
    expect(() => intentFromValue({
      kind: 'node.add',
      subject: '',
    })).toThrowError(expect.objectContaining({ code: 'E_USAGE' }));
    expect(() => reviewedSettlementFromValue({
      selector: {},
      plan: {},
    })).toThrowError(expect.objectContaining({ code: 'E_USAGE' }));
  });

  it('retains the reviewed Settlement invalidation rule', () => {
    const reviewed = reviewedSettlementFromValue({
      selector: {
        sourceLane: 'users',
        sourceStrand: 'review',
        targetLane: 'published-users',
      },
      plan: {
        invalidationRule: 'any-bound-input-change',
        planDigest: 'plan',
        sourceLaneId: 'users',
        targetLaneId: 'published-users',
        sourceFrontier: { id: 'source-frontier' },
        targetFrontier: { id: 'target-frontier' },
        proposalDigest: 'proposal',
        lawDigest: 'law',
        policyDigest: 'policy',
      },
    });

    expect(reviewed.plan.invalidationRule)
      .toBe('any-bound-input-change');
    expect(Object.isFrozen(reviewed.plan)).toBe(true);
  });

  it('rejects non-JSON object members without dropping them', () => {
    expect(() => toMcpJson({ invalid: undefined })).toThrowError(
      expect.objectContaining({ code: 'E_V19_JSON_VALUE' }),
    );
  });

  it('accepts receipt --input=value and reports malformed files as usage', async () => {
    const directory = makeTemporaryDirectory();
    const path = join(directory, 'receipt.json');
    writeFileSync(path, '{');

    await expect(handleReceipt({
      options: CLI_OPTIONS,
      args: ['show', `--input=${path}`],
    })).rejects.toMatchObject({
      code: 'E_USAGE',
      cause: expect.any(SyntaxError),
    });
  });

  it('reports unreadable Settlement plan files as usage errors', async () => {
    const path = join(makeTemporaryDirectory(), 'missing-plan.json');
    await expect(handleSettle({
      options: CLI_OPTIONS,
      args: ['apply', '--plan', path],
    })).rejects.toMatchObject({
      code: 'E_USAGE',
      message: expect.stringContaining(path),
    });
  });
});

function makeTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'warp-v19-input-'));
  temporaryDirectories.push(directory);
  return directory;
}
