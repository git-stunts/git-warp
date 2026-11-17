import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import handleReceipt from '../../../bin/cli/commands/receipt.ts';
import {
  V19_PUBLIC_NOUNS,
} from '../../../bin/cli/capabilities/V19CapabilityContract.generated.ts';
import type { CliOptions } from '../../../bin/cli/types.ts';
import {
  observerFromText,
} from '../../../bin/cli/v19/V19DomainInput.ts';
import { toMcpJson } from '../../../bin/presenters/V19Json.ts';

const temporaryDirectories: string[] = [];

const CLI_OPTIONS: CliOptions = {
  repo: '.',
  lane: 'users',
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
  it('normalizes malformed Observer JSON as usage errors', () => {
    expect(() => observerFromText('users.role', '{')).toThrowError(
      expect.objectContaining({
        code: 'E_USAGE',
        message: expect.stringContaining(
          `Invalid ${V19_PUBLIC_NOUNS.Observer} JSON`,
        ),
      }),
    );
  });

  it('rejects non-JSON object members without dropping them', () => {
    expect(() => toMcpJson({ invalid: undefined })).toThrowError(
      expect.objectContaining({ code: 'E_V19_JSON_VALUE' }),
    );
    expect(() => toMcpJson(new Date(0))).toThrowError(
      expect.objectContaining({ code: 'E_V19_JSON_VALUE' }),
    );
    expect(() => toMcpJson(new Map())).toThrowError(
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

});

function makeTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'warp-v19-input-'));
  temporaryDirectories.push(directory);
  return directory;
}
