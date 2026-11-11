import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Oracle: the Option B decision on #1032 (2026-11-08). v21.0.0 ships only
// when the four risks that expired on 2026-08-01 are eliminated in code, and
// every residual exposure waits for the maintainer to accept it.

const SECURITY_DOCUMENT = readFileSync('.github/SECURITY.md', 'utf8');
const AWAITING_ACCEPTANCE = 'requires maintainer acceptance';
const CLOSED_EXPIRY = 'Not applicable: closed';

type RiskRow = {
  readonly risk: string;
  readonly severity: string;
  readonly owner: string;
  readonly status: string;
  readonly expiry: string;
  readonly evidence: string;
};

function section(document: string, heading: string): string {
  const start = document.indexOf(`\n${heading}\n`);
  expect(start, `missing heading ${heading}`).toBeGreaterThanOrEqual(0);
  const rest = document.slice(start + heading.length + 2);
  const end = rest.search(/^## /mu);
  return end === -1 ? rest : rest.slice(0, end);
}

function tableCells(line: string): string[] {
  return line.slice(1, -1).split(' | ').map((cell) => cell.trim());
}

const RISK_TABLE_HEADER = '| Risk | Severity | Owner | Status | Expiry | Evidence |';

function riskTableLines(document: string): string[] {
  return section(document, '## Accepted Risks').split('\n').filter((line) => line.startsWith('| '));
}

/** Reads each row by column name, so a missing column reads as an empty cell. */
function riskRows(document: string): RiskRow[] {
  const [header = '', ...rows] = riskTableLines(document);
  const names = tableCells(header);
  return rows.map((line) => {
    const cells = tableCells(line);
    expect(cells, line).toHaveLength(names.length);
    const named = (name: string): string => cells[names.indexOf(name)] ?? '';
    return {
      risk: named('Risk'),
      severity: named('Severity'),
      owner: named('Owner'),
      status: named('Status'),
      expiry: named('Expiry'),
      evidence: named('Evidence'),
    };
  });
}

function rowFor(rows: readonly RiskRow[], risk: string): RiskRow {
  const matches = rows.filter((row) => row.risk === risk);
  expect(matches, `rows for ${risk}`).toHaveLength(1);
  const [match] = matches;
  if (match === undefined) {
    throw new Error(`no row for ${risk}`);
  }
  return match;
}

type ClosedRisk = {
  readonly risk: string;
  readonly severity: string;
  readonly closedBy: readonly string[];
  readonly evidence: readonly (readonly [path: string, symbol: string])[];
};

type ResidualRisk = {
  readonly risk: string;
  readonly severity: string;
  readonly issues: readonly string[];
};

const CLOSED_RISKS: readonly ClosedRisk[] = [
  {
    risk: '`roaring-wasm` bitmap faults could corrupt results or exhaust resources',
    severity: 'Medium',
    closedBy: ['#1087', '#1128'],
    evidence: [
      ['src/infrastructure/adapters/BoundedRoaringConstructor.ts', 'boundRoaringConstructor'],
      ['src/infrastructure/adapters/PortableRoaringShardInspector.ts', 'inspectPortableRoaringShard'],
      ['src/infrastructure/adapters/RoaringShardBounds.ts', 'MAX_ALIVE_CARDINALITY'],
      ['src/domain/artifacts/RoaringShardBytes.ts', 'requireRoaringShardBytes'],
      ['src/domain/services/optic/NeighborhoodPageCursor.ts', 'neighborhoodCandidateBudget'],
    ],
  },
  {
    risk: '`cbor-x` parser handles untrusted sync payloads',
    severity: 'Medium',
    closedBy: ['#1088', '#1148'],
    evidence: [
      ['src/infrastructure/codecs/CborCodec.ts', 'MAX_CBOR_DECODE_BYTES'],
      ['src/infrastructure/adapters/BoundedCborValidation.ts', 'ALLOWED_TAG_CONTENT'],
      ['src/infrastructure/adapters/BoundedCborValidation.ts', 'validateGenericBoundedCbor'],
    ],
  },
  {
    risk: 'Nonce cache lost on restart allows replay within clock skew window',
    severity: 'Low',
    closedBy: ['#1089', '#1149'],
    evidence: [
      ['src/infrastructure/adapters/GitCasSyncReplayProtectionAdapter.ts', 'GitCasSyncReplayProtectionAdapter'],
      ['src/domain/services/sync/SyncRequestFreshness.ts', 'isFreshOnStoreTime'],
      ['src/domain/services/sync/SyncRequestFreshness.ts', 'SYNC_REPLAY_ACCEPTANCE_WINDOW_MS'],
      ['src/domain/services/sync/SyncAuthService.ts', 'SyncAuthService'],
    ],
  },
  {
    risk: 'No rate limiting on sync endpoint',
    severity: 'Low',
    closedBy: ['#1090', '#1162'],
    evidence: [
      ['src/domain/services/sync/SyncPeerRateLimiter.ts', 'DEFAULT_SYNC_PEER_RATE_LIMIT'],
      ['src/domain/services/sync/SyncRateLimiter.ts', 'SyncRateLimiter'],
      ['src/domain/services/sync/HttpSyncServerHelpers.ts', 'validateNonLocalRateLimit'],
    ],
  },
];

const RESIDUAL_RISKS: readonly ResidualRisk[] = [
  {
    risk: 'One admitted edge bitmap can be expanded in full on some in-process reads, and a writer can store an index shard file that the default codec refuses to read',
    severity: 'Medium',
    issues: ['#1159'],
  },
  {
    risk: 'A sender with more distinct socket addresses than `maxTrackedPeers` is not limited by the peer admission limit, and the server has no global bound on unauthenticated work',
    severity: 'Low',
    issues: ['#1165', '#1164'],
  },
];

describe('the Accepted Risks register', () => {
  it('gives each row a status, an expiry and its evidence', () => {
    const [header] = riskTableLines(SECURITY_DOCUMENT);
    expect(header).toBe(RISK_TABLE_HEADER);
  });

  it('has no expired row: each row is closed or waits for maintainer acceptance', () => {
    const rows = riskRows(SECURITY_DOCUMENT);

    for (const row of rows) {
      expect(row.expiry, row.risk).not.toMatch(/EXPIRED/iu);
      // An accepted row carries its acceptance expiry as an ISO date.
      expect(row.expiry, row.risk).toMatch(/^(Not applicable: closed|\*\*None: requires maintainer acceptance\*\*|\d{4}-\d{2}-\d{2})$/u);
      expect(row.owner, row.risk).toBe('@flyingrobots');
    }
    expect(rows).toHaveLength(CLOSED_RISKS.length + RESIDUAL_RISKS.length);
  });

  it.each(CLOSED_RISKS)('closes "$risk" with its remediation and cites live source', (expected) => {
    const row = rowFor(riskRows(SECURITY_DOCUMENT), expected.risk);

    expect(row.severity).toBe(expected.severity);
    expect(row.status).toMatch(/^\*\*CLOSED\*\* /u);
    expect(row.expiry).toBe(CLOSED_EXPIRY);
    for (const reference of expected.closedBy) {
      expect(row.status).toContain(reference);
    }
    for (const [path, symbol] of expected.evidence) {
      expect(row.evidence, `${expected.risk} cites ${path}`).toContain(`\`${path}\``);
      expect(row.evidence, `${expected.risk} names ${symbol}`).toContain(`\`${symbol}\``);
      expect(existsSync(path), `${path} exists`).toBe(true);
      expect(readFileSync(path, 'utf8'), `${path} defines ${symbol}`).toContain(symbol);
    }
  });

  it.each(RESIDUAL_RISKS)('records "$risk" as open, tracked and awaiting acceptance', (expected) => {
    const row = rowFor(riskRows(SECURITY_DOCUMENT), expected.risk);

    expect(row.severity).toBe(expected.severity);
    expect(row.status).toMatch(/^Open/u);
    expect(row.expiry).toBe(`**None: ${AWAITING_ACCEPTANCE}**`);
    for (const issue of expected.issues) {
      expect(row.status).toContain(issue);
    }
  });
});

describe('statements that depend on the register', () => {
  it('no longer defers the register update to #1032', () => {
    expect(SECURITY_DOCUMENT).not.toContain('updates the row');
    expect(SECURITY_DOCUMENT).not.toContain('#1032](https://github.com/git-stunts/git-warp/issues/1032) updates them');
  });

  it('puts the sync rate limits in scope for availability', () => {
    const availability = section(SECURITY_DOCUMENT, '## Threat Model Boundaries')
      .split('\n')
      .filter((line) => line.startsWith('| **Availability** |'));
    expect(availability).toHaveLength(1);
    const [, inScope = '', outOfScope = ''] = tableCells(availability[0] ?? '');

    expect(inScope).toContain('peer admission limit');
    expect(inScope).toContain('per-key rate limit');
    expect(outOfScope).not.toContain('rate limiting (delegated to infrastructure)');
    expect(outOfScope).toContain('#1164');
  });

  it('describes cbor-x input as repository blobs behind the shared decoder bounds', () => {
    const rows = section(SECURITY_DOCUMENT, '## Dependency Risk Assessment')
      .split('\n')
      .filter((line) => line.startsWith('| `cbor-x` |'));
    expect(rows).toHaveLength(1);
    const [row = ''] = rows;

    expect(row).not.toContain('4 MB default');
    expect(row).toContain('`src/infrastructure/codecs/CborCodec.ts`');
    expect(row).toContain('repository blobs');
  });
});
