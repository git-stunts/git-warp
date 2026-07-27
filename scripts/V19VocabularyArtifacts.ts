import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

import {
  CapabilityContractError,
  type JsonObject,
  NOUN_SCHEMA,
} from './V19VocabularyContract.ts';

type ArtifactMode = 'check' | 'write';

type VocabularyArtifactOptions = {
  readonly root: string;
  readonly contract: JsonObject;
  readonly mode: ArtifactMode;
};

const GENERATED_HEADER =
  '/* @generated from schemas/v19-public-vocabulary.graphql by Wesley. Do not edit. */';

function renderPublicVocabularyTypescript(contract: JsonObject): string {
  const nouns = z.array(NOUN_SCHEMA).parse(contract['nouns']);
  const publicNouns = Object.fromEntries(
    nouns.map((noun) => [noun.name, noun.name]),
  );
  const publicVocabulary = Object.fromEntries(
    Object.entries(contract).filter(([name]) => name !== 'mcp'),
  );
  return [
    GENERATED_HEADER,
    '',
    `export const V19_PUBLIC_VOCABULARY = ${JSON.stringify(publicVocabulary, null, 2)} as const;`,
    '',
    `export const V19_PUBLIC_NOUNS = ${JSON.stringify(publicNouns, null, 2)} as const;`,
    '',
  ].join('\n');
}

function renderMcpTypescript(contract: JsonObject): string {
  const mcp = contract['mcp'];
  if (!Array.isArray(mcp)) {
    throw new CapabilityContractError(
      'v19 vocabulary contract requires MCP capabilities',
    );
  }
  return [
    GENERATED_HEADER,
    '',
    `export const V19_MCP_CAPABILITIES = ${JSON.stringify(mcp, null, 2)} as const;`,
    '',
  ].join('\n');
}

function renderContractTypescript(): string {
  return [
    GENERATED_HEADER,
    '',
    "import { V19_MCP_CAPABILITIES } from './V19McpCapabilities.generated.ts';",
    'import {',
    '  V19_PUBLIC_NOUNS,',
    '  V19_PUBLIC_VOCABULARY,',
    "} from './V19PublicVocabulary.generated.ts';",
    '',
    'export { V19_PUBLIC_NOUNS };',
    '',
    'export const V19_CAPABILITY_CONTRACT = {',
    '  ...V19_PUBLIC_VOCABULARY,',
    '  mcp: V19_MCP_CAPABILITIES,',
    '} as const;',
    '',
  ].join('\n');
}

function renderGlossary(contract: JsonObject): string {
  const nouns = z.array(NOUN_SCHEMA).parse(contract['nouns']);
  return [
    '<!-- @generated from schemas/v19-public-vocabulary.graphql by Wesley. Do not edit. -->',
    '',
    '# Public Vocabulary',
    '',
    z.string().parse(contract['moduleSummary']),
    '',
    '| Noun | Meaning |',
    '| --- | --- |',
    ...nouns.map((noun) => `| ${noun.name} | ${noun.summary} |`),
    '',
  ].join('\n');
}

function requireCurrent(path: string, expected: string): void {
  if (!existsSync(path)) {
    throw new CapabilityContractError(
      `v19 vocabulary artifact is missing: ${path}; run npm run generate:capabilities`,
    );
  }
  if (readFileSync(path, 'utf8') !== expected) {
    throw new CapabilityContractError(
      `v19 vocabulary artifact drifted: ${path}; run npm run generate:capabilities`,
    );
  }
}

function emitArtifact(
  path: string,
  content: string,
  mode: ArtifactMode,
): void {
  if (mode === 'check') {
    requireCurrent(path, content);
    return;
  }
  writeFileSync(path, content);
}

export function emitV19VocabularyArtifacts(
  options: VocabularyArtifactOptions,
): void {
  emitArtifact(
    resolve(options.root, 'bin/cli/capabilities/v19-capabilities.json'),
    `${JSON.stringify(options.contract, null, 2)}\n`,
    options.mode,
  );
  emitArtifact(
    resolve(
      options.root,
      'bin/cli/capabilities/V19CapabilityContract.generated.ts',
    ),
    renderContractTypescript(),
    options.mode,
  );
  emitArtifact(
    resolve(
      options.root,
      'bin/cli/capabilities/V19PublicVocabulary.generated.ts',
    ),
    renderPublicVocabularyTypescript(options.contract),
    options.mode,
  );
  emitArtifact(
    resolve(
      options.root,
      'bin/cli/capabilities/V19McpCapabilities.generated.ts',
    ),
    renderMcpTypescript(options.contract),
    options.mode,
  );
  emitArtifact(
    resolve(options.root, 'docs/topics/vocabulary.generated.md'),
    renderGlossary(options.contract),
    options.mode,
  );
}
