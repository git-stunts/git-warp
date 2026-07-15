import { describe, expect, it } from 'vitest';
import {
  findSourceVersionNameViolations,
  SOURCE_VERSION_NAME_EXCEPTIONS,
} from '../../../scripts/source-version-name-policy.ts';

describe('source version-name policy', () => {
  it('rejects versioned active source identifiers', () => {
    const violations = findSourceVersionNameViolations([
      {
        path: 'src/domain/services/Example.ts',
        source: 'export function reduceV5(): void {}',
      },
    ]);

    expect(violations).toEqual([
      {
        path: 'src/domain/services/Example.ts',
        line: 1,
        token: 'reduceV5',
        source: 'export function reduceV5(): void {}',
      },
    ]);
  });

  it('rejects versioned source paths', () => {
    const violations = findSourceVersionNameViolations([
      {
        path: 'src/domain/services/ExampleV5.ts',
        source: 'export function reducePatches(): void {}',
      },
    ]);

    expect(violations).toEqual([
      {
        path: 'src/domain/services/ExampleV5.ts',
        line: 0,
        token: 'src/domain/services/ExampleV5.ts',
        source: 'versioned source path',
      },
    ]);
  });

  it('allows named immutable wire token exceptions', () => {
    const violations = findSourceVersionNameViolations([
      {
        path: 'src/domain/trust/canonical.ts',
        source: "const TRUST_RECORD_ID_DOMAIN = 'git-warp:trust-record:v1\\0';",
      },
      {
        path: 'src/infrastructure/adapters/BunHttpAdapter.ts',
        source: "const family = host.includes(':') ? 'IPv6' : 'IPv4';",
      },
      {
        path: 'src/ports/CommitMessageCodecPort.ts',
        source: "const schema = 'git-cas-asset-patch-v1';",
      },
    ]);

    expect(violations).toEqual([]);
  });

  it('documents every exception with a reason', () => {
    const missingReasons = SOURCE_VERSION_NAME_EXCEPTIONS
      .filter((exception) => exception.reason.length === 0)
      .map((exception) => exception.name);

    expect(missingReasons).toEqual([]);
  });
});
