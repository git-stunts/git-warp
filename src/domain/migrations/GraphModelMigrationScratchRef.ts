import GraphModelMigrationNotice from './GraphModelMigrationNotice.ts';
import WarpError from '../errors/WarpError.ts';

const SCRATCH_REF_PREFIX = 'refs/warp-migration-scratch/';
const LIVE_WARP_REF_PREFIX = 'refs/warp/';
const MISSING_SCRATCH_REF_CODE = 'E_MISSING_SCRATCH_REF';
const LIVE_REF_TARGET_CODE = 'E_LIVE_REF_TARGET';
const INVALID_SCRATCH_REF_CODE = 'E_INVALID_SCRATCH_REF';
const INVALID_REF_CHARACTERS = Object.freeze(new Set(['~', '^', ':', '?', '*', '[', '\\']));

export type GraphModelMigrationScratchRefFields = {
  readonly refName: string;
};

/** Explicit scratch ref target for graph-model migration writes. */
export default class GraphModelMigrationScratchRef {
  readonly refName: string;

  constructor(fields: GraphModelMigrationScratchRefFields) {
    const checkedFields = requireFields(fields);
    const notice = GraphModelMigrationScratchRef.validateRefName(checkedFields.refName);
    if (notice !== null) {
      throw new WarpError(notice.message, notice.code);
    }
    this.refName = checkedFields.refName;
    Object.freeze(this);
  }

  /** Validates a scratch ref target without constructing one. */
  static validateRefName(refName: string | null | undefined): GraphModelMigrationNotice | null {
    if (typeof refName !== 'string' || refName.length === 0) {
      return GraphModelMigrationNotice.fatal(
        MISSING_SCRATCH_REF_CODE,
        'graph-model migration requires an explicit scratch ref target',
      );
    }
    const prefixNotice = validateRefPrefix(refName);
    return prefixNotice ?? validateRefShape(refName);
  }

  /** Returns the Git ref name. */
  toString(): string {
    return this.refName;
  }
}

function requireFields(
  fields: GraphModelMigrationScratchRefFields | null | undefined,
): GraphModelMigrationScratchRefFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationScratchRef fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

function hasInvalidRefShape(refName: string): boolean {
  const suffix = refName.slice(SCRATCH_REF_PREFIX.length);
  return [
    suffix.length === 0,
    suffix.startsWith('/'),
    suffix.endsWith('/'),
    refName.includes('//'),
    refName.includes('..'),
    refName.trim() !== refName,
    containsInvalidRefCharacter(refName),
  ].some((invalid) => invalid);
}

function containsInvalidRefCharacter(refName: string): boolean {
  for (const character of refName) {
    if (isInvalidRefCharacter(character)) {
      return true;
    }
  }
  return false;
}

function validateRefPrefix(refName: string): GraphModelMigrationNotice | null {
  if (refName.startsWith(LIVE_WARP_REF_PREFIX)) {
    return GraphModelMigrationNotice.fatal(
      LIVE_REF_TARGET_CODE,
      `scratch migration writer refuses live graph ref target ${refName}`,
    );
  }
  if (!refName.startsWith(SCRATCH_REF_PREFIX)) {
    return GraphModelMigrationNotice.fatal(
      INVALID_SCRATCH_REF_CODE,
      `scratch migration ref must start with ${SCRATCH_REF_PREFIX}`,
    );
  }
  return null;
}

function validateRefShape(refName: string): GraphModelMigrationNotice | null {
  if (!hasInvalidRefShape(refName)) {
    return null;
  }
  return GraphModelMigrationNotice.fatal(
    INVALID_SCRATCH_REF_CODE,
    `scratch migration ref has invalid shape ${refName}`,
  );
}

function isInvalidRefCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code <= 32 || code === 127 || INVALID_REF_CHARACTERS.has(character);
}
