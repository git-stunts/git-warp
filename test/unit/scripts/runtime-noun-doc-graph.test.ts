import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ApertureOpeningProof,
  BoundedSupportRule,
  CausalIndexPlan,
  Observer,
  Optic,
  OpticAperturePosture,
  OpticBasisPosture,
  OpticCoordinatePosture,
  SupportFragmentPlan,
  WarpWorldlineCoordinate,
  ContinuumEvidencePosture,
} from '../../../index.ts';
import type { Aperture } from '../../../index.ts';
import MarkdownDocument from '../../helpers/MarkdownDocument.ts';

function readDoc(relativePath: string): string {
  return fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url));
}

const glossary = MarkdownDocument.fromFile(readDoc('docs/GLOSSARY.md'));
const guide = MarkdownDocument.fromFile(readDoc('docs/GUIDE.md'));
const conceptualOverview = MarkdownDocument.fromFile(readDoc('docs/CONCEPTUAL_OVERVIEW.md'));

const runtimeTerms = Object.freeze([
  { term: 'Coordinate', exportedName: 'WarpWorldlineCoordinate', status: 'transition' },
  { term: 'Observer', exportedName: 'Observer', status: 'transition' },
  { term: 'Aperture', exportedName: 'Aperture', status: 'transition' },
  { term: 'Optic', exportedName: 'Optic', status: 'transition' },
  { term: 'WarpStateSnapshot', exportedName: 'SnapshotWarpState', status: 'shipped' },
  { term: 'Causal index', exportedName: 'CausalIndexPlan', status: 'transition' },
  { term: 'Support fragment', exportedName: 'SupportFragmentPlan', status: 'transition' },
]);

const targetTerms = Object.freeze([]);

function glossaryRow(term: string) {
  return glossary.tableRowByFirstCell(`\`${term}\``);
}

describe('runtime noun documentation graph', () => {
  it('defines the status model for shipped, transition, and target nouns', () => {
    expect(glossary.hasHeading(1, 'Glossary')).toBe(true);
    expect(glossary.hasHeading(2, 'Status key')).toBe(true);
    expect(glossary.listItems().some((item) => item.startsWith('**shipped**:'))).toBe(true);
    expect(glossary.listItems().some((item) => item.startsWith('**transition**:'))).toBe(true);
    expect(glossary.listItems().some((item) => item.startsWith('**target**:'))).toBe(true);
  });

  it('records exported runtime nouns with their current status', () => {
    for (const { term, exportedName, status } of runtimeTerms) {
      const row = glossaryRow(term);
      expect(row?.cells[3]).toBe(status);
      expect(row?.cells.join(' ')).toContain(exportedName);
    }
  });

  it('records planned target nouns without pretending they are shipped runtime', () => {
    for (const term of targetTerms) {
      expect(glossaryRow(term)?.cells[3]).toBe('target');
    }
  });

  it('keeps the observer-geometry working law connected to documented nouns', () => {
    expect(glossary.hasHeading(2, 'Working law')).toBe(true);
    expect(glossary.listItems().some((item) => item.includes('**Observer**') && item.includes('**Optic**')))
      .toBe(true);
    expect(glossary.listItems().some((item) => item.includes('**bounded support rule**'))).toBe(true);
  });

  it('is pointed to by the high-traffic conceptual docs', () => {
    expect(guide.hasLink('GLOSSARY.md', 'GLOSSARY.md')).toBe(true);
    expect(conceptualOverview.hasLink('GLOSSARY.md', 'GLOSSARY.md')).toBe(true);
  });

  it('exercises public runtime nouns that back the glossary', () => {
    const aperture: Aperture = {
      match: 'user:*',
      expose: ['name'],
      redact: ['secret'],
    };
    const observer = new Observer({ name: 'public-users', config: aperture });
    const supportRule = BoundedSupportRule.entityRead({
      surface: 'query',
      nodeIds: ['user:alice'],
    });
    const causalIndexPlan = CausalIndexPlan.fromSupportRule(supportRule);
    const supportFragmentPlan = SupportFragmentPlan.fromSupportRule(supportRule);
    const coordinate = new WarpWorldlineCoordinate({
      worldlineName: 'events',
      checkpointSha: 'checkpoint-1',
      frontier: new Map([
        ['writer-b', 'patch-b'],
        ['writer-a', 'patch-a'],
      ]),
      createWorldline: () => {
        throw new Error('coordinate optic should not be opened in this noun contract');
      },
    });
    const proof = new ApertureOpeningProof({
      evaluatedTick: 7,
      evaluatedNodeId: 'user:alice',
      evaluatedValue: new Uint8Array([1, 2, 3]),
      verkleProof: new Uint8Array([4, 5, 6]),
    });
    const optic = Optic.node({
      nodeId: 'user:alice',
      coordinatePosture: OpticCoordinatePosture.capturedCoordinate(),
      aperturePosture: OpticAperturePosture.defaultFullRead(),
      basisPosture: OpticBasisPosture.checkpointTailBasisVerified(),
      evidencePosture: ContinuumEvidencePosture.translatedGitWarpEvidence(),
    });

    expect(observer.name).toBe('public-users');
    expect(observer.source?.kind).toBe('live');
    expect(causalIndexPlan.canUseCausalIndex()).toBe(true);
    expect(supportFragmentPlan.canMaterializeSupportFragment()).toBe(true);
    expect(coordinate.source()).toEqual({
      kind: 'coordinate',
      frontier: new Map([
        ['writer-a', 'patch-a'],
        ['writer-b', 'patch-b'],
      ]),
      checkpointSha: 'checkpoint-1',
    });
    expect(proof.evaluatedValueBytes()).toEqual(new Uint8Array([1, 2, 3]));
    expect(proof.verkleProofBytes()).toEqual(new Uint8Array([4, 5, 6]));
    expect(optic.toContextValue()).toMatchObject({
      opticKind: 'node',
      target: { nodeId: 'user:alice' },
      supportRule: 'exact-entity',
    });
  });
});
