import { z } from 'zod';

import type { JsonObject } from './V19VocabularyContract.ts';
import { CapabilityContractError } from './V19VocabularyContract.ts';
import {
  containsVocabularyPhrase,
  vocabularyTokens,
} from './V19VocabularyMatching.ts';

const CONTRACT_SCHEMA = z.object({
  moduleSummary: z.string(),
  sdkSummary: z.string(),
  nouns: z.array(z.object({
    name: z.string(),
    summary: z.string(),
  })),
  forbiddenTerms: z.array(z.object({
    phrase: z.string(),
    scopes: z.array(z.enum(['ROOT_DECLARATION', 'PUBLIC_SURFACE'])),
  })),
  cli: z.array(z.object({
    command: z.string(),
    summary: z.string(),
    usage: z.string(),
  })),
  mcp: z.array(z.object({
    name: z.string(),
    description: z.string(),
  })),
});

type PublicText = Readonly<{
  readonly field: string;
  readonly value: string;
}>;

export type PublicVocabularyViolation = Readonly<{
  readonly field: string;
  readonly phrase: string;
  readonly value: string;
}>;

export function findForbiddenPublicVocabulary(
  contract: JsonObject,
): readonly PublicVocabularyViolation[] {
  const parsed = CONTRACT_SCHEMA.parse(contract);
  const forbidden = parsed.forbiddenTerms.filter(
    (term) => term.scopes.includes('PUBLIC_SURFACE'),
  );
  return publicText(parsed).flatMap((candidate) =>
    forbidden
      .filter((term) => containsVocabularyPhrase(
        vocabularyTokens(candidate.value),
        vocabularyTokens(term.phrase),
      ))
      .map((term) => Object.freeze({
        field: candidate.field,
        phrase: term.phrase,
        value: candidate.value,
      }))
  );
}

export function requireCleanPublicVocabulary(contract: JsonObject): void {
  const violations = findForbiddenPublicVocabulary(contract);
  if (violations.length === 0) {
    return;
  }
  const summary = violations.map(
    (violation) => `${violation.field}: ${violation.phrase}`,
  ).join(', ');
  throw new CapabilityContractError(
    `v19 public vocabulary contains legacy terms: ${summary}`,
  );
}

function publicText(
  contract: z.infer<typeof CONTRACT_SCHEMA>,
): readonly PublicText[] {
  return [
    { field: 'moduleSummary', value: contract.moduleSummary },
    { field: 'sdkSummary', value: contract.sdkSummary },
    ...contract.nouns.flatMap((noun) => [
      { field: `nouns.${noun.name}.name`, value: noun.name },
      { field: `nouns.${noun.name}.summary`, value: noun.summary },
    ]),
    ...contract.cli.flatMap((capability) => [
      { field: `cli.${capability.command}.command`, value: capability.command },
      { field: `cli.${capability.command}.summary`, value: capability.summary },
      { field: `cli.${capability.command}.usage`, value: capability.usage },
    ]),
    ...contract.mcp.flatMap((capability) => [
      { field: `mcp.${capability.name}.name`, value: capability.name },
      {
        field: `mcp.${capability.name}.description`,
        value: capability.description,
      },
    ]),
  ];
}
