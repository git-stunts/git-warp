import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import * as advanced from '../../../advanced.ts';
import * as charts from '../../../charts.ts';
import * as diagnostics from '../../../diagnostics.ts';
import * as root from '../../../index.ts';
import * as testing from '../../../testing.ts';
import { COMMANDS } from '../../../bin/cli/commands/registry.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const GUIDE = readFileSync(join(ROOT, 'docs/migrations/v21/README.md'), 'utf8');

/**
 * Names the v21 guide once told readers to call or implement, although only
 * internal hosts carry them (#1154): the duplicate-dot repair and allocation
 * provenance calls of `RuntimeHost` and `WarpCore`, and the HTTP sync client,
 * server and ports.
 */
const INTERNAL_NAMES = [
  'previewDotRepair',
  'applyDotRepair',
  'resolveAllocationProvenance',
  'signSyncRequest',
  'SyncAuthService',
  'HttpSyncServer',
  'serve',
  'syncWith',
  'ClockPort',
  'SyncReplayProtectionPort',
  'HttpServerPort',
  'peerRateLimit',
  'replayProtection',
] as const;

const MEMBER_DEPTH = 3;

/** Every name reachable from `value` through own properties and class prototypes, `depth` levels down. */
function reachableNames(value: unknown, depth: number, seen: Set<unknown>): string[] {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null || depth === 0 || seen.has(value)) {
    return [];
  }
  seen.add(value);
  const prototype: unknown = typeof value === 'function' ? Reflect.get(value, 'prototype') : null;
  const holders = typeof prototype === 'object' && prototype !== null ? [value, prototype] : [value];
  return holders.flatMap((holder) => Object.getOwnPropertyNames(holder).flatMap((name) => [
    name,
    ...reachableNames(Reflect.getOwnPropertyDescriptor(holder, name)?.value, depth - 1, seen),
  ]));
}

/** Export names of the five package entry points, their members, and the CLI command names. */
const PUBLIC_NAMES: ReadonlySet<string> = new Set([
  ...[root, advanced, diagnostics, charts, testing].flatMap((entry) => Object.entries(entry).flatMap(([name, value]) => [
    name,
    ...reachableNames(value, MEMBER_DEPTH, new Set()),
  ])),
  ...COMMANDS.keys(),
]);

/** The text of every fenced block and inline code span in `markdown`. */
function codeOf(markdown: string): string {
  const fence = /^```[^\n]*\n([\s\S]*?)^```/gmu;
  const fenced = [...markdown.matchAll(fence)].map((match) => match[1] ?? '');
  const inline = [...markdown.replace(fence, '').matchAll(/`([^`\n]+)`/gu)].map((match) => match[1] ?? '');
  return [...fenced, ...inline].join('\n');
}

const GUIDE_CODE = codeOf(GUIDE);

describe('v21 migration guide names only public routes (#1154)', () => {
  it('harvests the public names of the package entry points and the CLI', () => {
    expect([...PUBLIC_NAMES]).toEqual(expect.arrayContaining([
      'Warp', 'open', 'as', 'close', 'Runtime', 'GitStorage', 'at', 'intent', 'inspectReceipt', 'observe', 'repair',
    ]));
  });

  it('harvests the code of the guide, including its tested example', () => {
    expect(GUIDE_CODE).toContain('Warp.open(WarpAddress.of(GitStorage.at(at)');
  });

  it.each(INTERNAL_NAMES)('no package entry point or CLI command reaches %s', (name) => {
    expect(PUBLIC_NAMES.has(name), `${name} is public now; remove it from INTERNAL_NAMES`).toBe(false);
  });

  it.each(INTERNAL_NAMES)('the guide does not name %s', (name) => {
    expect(GUIDE_CODE, `the guide names the internal ${name}`).not.toMatch(new RegExp(`\\b${name}\\b`, 'u'));
  });

  it('the guide calls nothing on an internal core object', () => {
    expect(GUIDE_CODE, 'the guide calls a method of the internal WarpCore').not.toMatch(/\bcore\./u);
  });
});
