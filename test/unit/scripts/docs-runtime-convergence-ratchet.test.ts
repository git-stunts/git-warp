import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import MarkdownDocument from '../../helpers/MarkdownDocument.ts';

function readDoc(relativePath: string): MarkdownDocument {
  return MarkdownDocument.fromFile(fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)));
}

const ratchet = readDoc('docs/DOCTRINE_RUNTIME_ALIGNMENT.md');
const docsIndex = readDoc('docs/README.md');
const warpDrift = readDoc('docs/audits/WARP_DRIFT.md');
const apiReference = readDoc('docs/API_REFERENCE.md');
const conceptualOverview = readDoc('docs/CONCEPTUAL_OVERVIEW.md');
const glossary = readDoc('docs/GLOSSARY.md');

describe('docs/runtime convergence ratchet', () => {
  it('defines the allowed docs-ahead posture with status labels', () => {
    expect(ratchet.hasHeading(1, 'Doctrine/runtime alignment ratchet')).toBe(true);
    expect(ratchet.hasHeading(2, 'Status labels')).toBe(true);
    expect(ratchet.hasHeading(2, 'Allowed docs-ahead posture')).toBe(true);
    expect(ratchet.listItems().some((item) => item.startsWith('**shipped**:'))).toBe(true);
    expect(ratchet.listItems().some((item) => item.startsWith('**transition**:'))).toBe(true);
    expect(ratchet.listItems().some((item) => item.startsWith('**target**:'))).toBe(true);
  });

  it('requires runtime evidence before target doctrine becomes current truth', () => {
    expect(ratchet.hasHeading(2, 'Runtime evidence')).toBe(true);
    expect(ratchet.containsText('GitHub Issue')).toBe(true);
    expect(ratchet.containsText('behavior tests or conformance tests')).toBe(true);
    expect(ratchet.containsText('public API cost posture')).toBe(true);
    expect(ratchet.containsText('docs may name the target')).toBe(true);
    expect(ratchet.containsText('make the target current')).toBe(true);
  });

  it('connects the ratchet to the canonical noun and drift surfaces', () => {
    expect(ratchet.hasLink('GLOSSARY.md', 'GLOSSARY.md')).toBe(true);
    expect(ratchet.hasLink('WARP_DRIFT.md', 'audits/WARP_DRIFT.md')).toBe(true);
    expect(warpDrift.hasLink(
      'doctrine/runtime alignment ratchet',
      '../DOCTRINE_RUNTIME_ALIGNMENT.md',
    )).toBe(true);
    expect(glossary.hasHeading(2, 'Status key')).toBe(true);
  });

  it('keeps the guardrail visible from high-traffic docs', () => {
    expect(docsIndex.hasLink(
      'Doctrine/runtime Alignment Ratchet',
      'DOCTRINE_RUNTIME_ALIGNMENT.md',
    )).toBe(true);
    expect(apiReference.hasLink(
      'Doctrine/runtime Alignment Ratchet',
      'DOCTRINE_RUNTIME_ALIGNMENT.md',
    )).toBe(true);
    expect(conceptualOverview.hasLink(
      'Doctrine/runtime Alignment Ratchet',
      'DOCTRINE_RUNTIME_ALIGNMENT.md',
    )).toBe(true);
  });
});
