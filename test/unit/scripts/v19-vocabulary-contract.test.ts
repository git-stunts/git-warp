import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';

import {
  V19_CAPABILITY_CONTRACT,
} from '../../../bin/cli/capabilities/V19CapabilityContract.generated.ts';
import {
  findForbiddenPublicVocabulary,
} from '../../../scripts/V19VocabularyConformance.ts';
import {
  emitV19VocabularyArtifacts,
} from '../../../scripts/V19VocabularyArtifacts.ts';
import type {
  JsonObject,
} from '../../../scripts/V19VocabularyContract.ts';
import {
  readV19VocabularyContract,
} from '../../../scripts/V19VocabularyContract.ts';
import {
  containsVocabularyPhrase,
  vocabularyTokens,
} from '../../../scripts/V19VocabularyMatching.ts';
import { COMMANDS } from '../../../bin/cli/commands/registry.ts';
import {
  listMcpTools,
} from '../../../bin/cli/commands/mcp/McpToolCatalog.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const VOCABULARY_IR = resolve(
  ROOT,
  'schemas/v19-public-vocabulary.wesley.generated.json',
);
const temporaryDirectories: string[] = [];
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

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

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

  it('uses a project-scoped allowed-values directive', () => {
    const schema = readFileSync(
      resolve(ROOT, 'schemas/v19-public-vocabulary.graphql'),
      'utf8',
    );
    expect(schema).toContain('directive @allowedValues(');
    expect(schema).not.toContain('directive @oneOf(');
  });

  it('identifies the exact missing generated artifact', () => {
    const root = makeTemporaryDirectory();
    const expectedPath = resolve(
      root,
      'bin/cli/capabilities/v19-capabilities.json',
    );
    expect(() => emitV19VocabularyArtifacts({
      root,
      contract: readV19VocabularyContract(VOCABULARY_IR),
      mode: 'check',
    })).toThrowError(expect.objectContaining({
      message: expect.stringContaining(expectedPath),
    }));
  });

  it('names capability fields with missing metadata', () => {
    const lowered = JSON.parse(
      readFileSync(VOCABULARY_IR, 'utf8'),
    ) as LoweredVocabularyFixture;
    const capabilities = lowered.types.find(
      (type) => type.name === 'PublicCapabilities',
    );
    const field = capabilities?.fields[0];
    expect(field).toBeDefined();
    if (field === undefined) {
      throw new Error('PublicCapabilities requires at least one field');
    }
    delete field.directives['capability'];
    const path = join(makeTemporaryDirectory(), 'missing-capability.json');
    writeFileSync(path, JSON.stringify(lowered));

    expect(() => readV19VocabularyContract(path)).toThrowError(
      expect.objectContaining({
        message: expect.stringContaining(
          `${field.name} is missing required capability metadata`,
        ),
      }),
    );
  });

  it('shares camel-case and plural-tolerant vocabulary matching', () => {
    const candidate = vocabularyTokens('legacyGraphStores');
    expect(candidate).toEqual(['legacy', 'graph', 'stores']);
    expect(containsVocabularyPhrase(
      candidate,
      vocabularyTokens('graph store'),
    )).toBe(true);
    expect(containsVocabularyPhrase(
      candidate,
      vocabularyTokens('graph storage'),
    )).toBe(false);
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

  it('keeps generated public metadata free of legacy vocabulary', () => {
    expect(findForbiddenPublicVocabulary(
      V19_CAPABILITY_CONTRACT,
    )).toEqual([]);
  });

  it('enforces every public-surface term from the generated registry', () => {
    const artifact = readFileSync(
      resolve(ROOT, 'bin/cli/capabilities/v19-capabilities.json'),
      'utf8',
    );
    const publicTerms = V19_CAPABILITY_CONTRACT.forbiddenTerms.filter(
      (term) => term.scopes.some(
        (scope) => scope === 'PUBLIC_SURFACE',
      ),
    );
    for (const term of publicTerms) {
      const parsed = JSON.parse(artifact) as JsonObject;
      const contract: JsonObject = {
        ...parsed,
        moduleSummary: `Legacy ${term.phrase} surface`,
      };
      expect(findForbiddenPublicVocabulary(contract)).toEqual([
        expect.objectContaining({
          field: 'moduleSummary',
          phrase: term.phrase,
        }),
      ]);
    }
  });
});

type LoweredVocabularyFixture = {
  readonly types: Array<{
    readonly name: string;
    readonly fields: Array<{
      readonly name: string;
      readonly directives: Record<string, unknown>;
    }>;
  }>;
};

function makeTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'warp-vocabulary-'));
  temporaryDirectories.push(directory);
  return directory;
}
