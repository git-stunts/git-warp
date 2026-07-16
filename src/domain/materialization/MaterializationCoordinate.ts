import WarpError from '../errors/WarpError.ts';
import { compareStrings } from '../utils/StringComparison.ts';

export type MaterializationFrontierEntry = Readonly<{
  writerId: string;
  patchSha: string;
}>;

/** Immutable causal coordinate identifying one exact materialization. */
export default class MaterializationCoordinate {
  readonly frontierEntries: readonly MaterializationFrontierEntry[];
  readonly ceiling: number | null;

  constructor(options: {
    readonly frontier: Map<string, string>;
    readonly ceiling: number | null;
  }) {
    requireOptions(options);
    this.frontierEntries = freezeFrontier(options.frontier);
    this.ceiling = requireCeiling(options.ceiling);
    Object.freeze(this);
  }

  frontier(): Map<string, string> {
    return new Map(
      this.frontierEntries.map((entry) => [entry.writerId, entry.patchSha]),
    );
  }

  equals(other: MaterializationCoordinate | null | undefined): boolean {
    if (!(other instanceof MaterializationCoordinate) || this.ceiling !== other.ceiling) {
      return false;
    }
    if (this.frontierEntries.length !== other.frontierEntries.length) {
      return false;
    }
    return this.frontierEntries.every((entry, index) => {
      const candidate = other.frontierEntries[index];
      return candidate?.writerId === entry.writerId && candidate.patchSha === entry.patchSha;
    });
  }
}

function freezeFrontier(frontier: Map<string, string>): readonly MaterializationFrontierEntry[] {
  if (!(frontier instanceof Map)) {
    throw coordinateError('frontier must be a Map');
  }
  return Object.freeze(
    [...frontier.entries()]
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([writerId, patchSha]) => Object.freeze({
        writerId: requireNonEmpty(writerId, 'frontier writerId'),
        patchSha: requireNonEmpty(patchSha, 'frontier patchSha'),
      })),
  );
}

function requireCeiling(ceiling: number | null): number | null {
  if (ceiling === null) {
    return null;
  }
  if (!Number.isSafeInteger(ceiling) || ceiling < 0) {
    throw coordinateError('ceiling must be a non-negative safe integer or null');
  }
  return ceiling;
}

function requireNonEmpty(value: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw coordinateError(`${field} must be a non-empty string`);
  }
  return value;
}

function requireOptions(options: object): void {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw coordinateError('options must be an object');
  }
}

function coordinateError(message: string): WarpError {
  return new WarpError(`Materialization coordinate ${message}`, 'E_MATERIALIZATION_COORDINATE');
}
