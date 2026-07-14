import PersistenceError from '../../domain/errors/PersistenceError.ts';
import type { NodeInfo } from '../../ports/CommitPort.ts';

/** Decodes the NUL-delimited commit record emitted by Git show. */
export default function decodeGitCommitNodeInfo(output: string, sha: string): NodeInfo {
  const parts = output.split('\x00');
  if (parts.length < 5) {
    throw new PersistenceError(
      `Invalid commit format for SHA ${sha}`,
      PersistenceError.E_MISSING_OBJECT,
      { context: { oid: sha } }
    );
  }
  return {
    sha: partAt(parts, 0).trim(),
    author: partAt(parts, 1).trim(),
    date: partAt(parts, 2).trim(),
    parents: partAt(parts, 3).split(' ').filter(hasText),
    message: parts.slice(4).join('\x00'),
  };
}

function partAt(parts: readonly string[], index: number): string {
  return parts[index] ?? '';
}

function hasText(value: string): boolean {
  return value.length > 0;
}
