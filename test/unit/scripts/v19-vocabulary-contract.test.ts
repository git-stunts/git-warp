import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  V19_CAPABILITY_CONTRACT,
} from '../../../bin/cli/capabilities/V19CapabilityContract.generated.ts';
import { COMMANDS } from '../../../bin/cli/commands/registry.ts';
import {
  listMcpTools,
} from '../../../bin/cli/commands/mcp/McpToolCatalog.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const CANONICAL_NOUNS = [
  'Runtime',
  'Lane',
  'Intent',
  'Observer',
  'Observation',
  'Reading',
  'Receipt',
  'Settlement',
] as const;

describe('generated v19 vocabulary contract', () => {
  it('publishes the accepted registry identity and noun order', () => {
    expect(V19_CAPABILITY_CONTRACT.version)
      .toBe('git-warp.capabilities/v19');
    expect(V19_CAPABILITY_CONTRACT.nouns.map((noun) => noun.name))
      .toEqual(CANONICAL_NOUNS);
  });

  it('keeps the TypeDoc module summary bound to the registry', () => {
    const source = readFileSync(resolve(ROOT, 'index.ts'), 'utf8');
    const sourceFile = ts.createSourceFile(
      'index.ts',
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const comments = ts.getLeadingCommentRanges(
      source,
      sourceFile.getFullStart(),
    ) ?? [];
    const moduleDocumentation = comments
      .map((comment) => source.slice(comment.pos, comment.end))
      .join('\n');
    expect(moduleDocumentation)
      .toContain(V19_CAPABILITY_CONTRACT.moduleSummary);
  });

  it('drives CLI and MCP capability names in registry order', () => {
    expect([...COMMANDS.keys()])
      .toEqual(V19_CAPABILITY_CONTRACT.cli.map((entry) => entry.command));
    expect(listMcpTools().map((tool) => tool.name))
      .toEqual(V19_CAPABILITY_CONTRACT.mcp.map((entry) => entry.name));
  });

  it('keeps JSON and TypeScript artifacts byte-semantically equal', () => {
    const json = JSON.parse(readFileSync(
      resolve(ROOT, 'bin/cli/capabilities/v19-capabilities.json'),
      'utf8',
    ));
    expect(json).toEqual(V19_CAPABILITY_CONTRACT);
  });

  it('generates glossary and SDK documentation from registry summaries', () => {
    const glossary = readFileSync(
      resolve(ROOT, 'docs/topics/vocabulary.generated.md'),
      'utf8',
    );
    const sdk = readFileSync(
      resolve(ROOT, 'test/fixtures/generated-sdk/users.generated.ts'),
      'utf8',
    );
    expect(glossary).toContain(V19_CAPABILITY_CONTRACT.moduleSummary);
    for (const noun of V19_CAPABILITY_CONTRACT.nouns) {
      expect(glossary).toContain(`| ${noun.name} | ${noun.summary} |`);
    }
    expect(sdk).toContain(V19_CAPABILITY_CONTRACT.sdkSummary);
  });

  it('keeps normative docs aligned on every canonical noun', () => {
    const paths = [
      'README.md',
      'docs/migrations/v19/README.md',
      'docs/topics/api/README.md',
      'docs/topics/reference.md',
    ];
    for (const path of paths) {
      const text = readFileSync(resolve(ROOT, path), 'utf8');
      for (const noun of CANONICAL_NOUNS) {
        expect(text.toLowerCase(), `${path} must name ${noun}`)
          .toContain(noun.toLowerCase());
      }
    }
  });

  it('limits legacy exceptions to existing explicit boundaries', () => {
    expect(V19_CAPABILITY_CONTRACT.exceptionPaths).not.toEqual([]);
    for (const path of V19_CAPABILITY_CONTRACT.exceptionPaths) {
      expect(existsSync(resolve(ROOT, path)), path).toBe(true);
    }
    expect(V19_CAPABILITY_CONTRACT.exceptionPaths)
      .not.toContain('src/domain/');
    expect(V19_CAPABILITY_CONTRACT.exceptionPaths)
      .not.toContain('bin/');
  });
});
