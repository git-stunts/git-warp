import { describe, expect, it } from 'vitest';

import TreeEntryFound from '../../../../src/domain/tree/TreeEntryFound.ts';
import TreeEntryPath from '../../../../src/domain/tree/TreeEntryPath.ts';

describe('tree entry evidence nouns', () => {
  it('rejects returned tree-entry OIDs that are not Git object IDs', () => {
    const path = new TreeEntryPath('frontier.cbor');

    expect(() => new TreeEntryFound({
      path,
      oid: 'not-a-valid-oid',
    })).toThrow(/Tree entry OID must be a Git object ID/);
  });

  it('rejects whitespace-padded returned tree-entry OIDs', () => {
    const path = new TreeEntryPath('frontier.cbor');

    expect(() => new TreeEntryFound({
      path,
      oid: ` ${'a'.repeat(40)} `,
    })).toThrow(/Tree entry OID must be a Git object ID/);
  });

  it('rejects path values with leading or trailing whitespace', () => {
    expect(() => new TreeEntryPath(' index')).toThrow(
      /Tree entry path must not have leading or trailing whitespace/,
    );
    expect(() => new TreeEntryPath('index ')).toThrow(
      /Tree entry path must not have leading or trailing whitespace/,
    );
  });

  it('normalizes trailing slash runs for prefix path lookup', () => {
    expect(new TreeEntryPath('index//').withoutTrailingSlash().value).toBe('index');
  });
});
