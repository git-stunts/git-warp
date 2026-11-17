import type V18MigrationCliPlaceholder from './V18MigrationCliPlaceholder.ts';

export type V18MigrationCliFlagRecord = Readonly<{
  aliases?: readonly string[];
  name: string;
  summary: string;
  value?: V18MigrationCliPlaceholder;
}>;

/** One migration CLI flag: its accepted names, its value, and its documented meaning. */
export default class V18MigrationCliFlag {
  readonly aliases: readonly string[];
  readonly name: string;
  readonly summary: string;
  readonly value: V18MigrationCliPlaceholder | null;

  constructor(record: V18MigrationCliFlagRecord) {
    const aliases = record.aliases ?? [];
    [...aliases, record.name].forEach(requireFlagName);
    if (record.summary === '') {
      throw new Error(`CLI flag ${record.name} needs a summary`);
    }
    this.aliases = Object.freeze([...aliases]);
    this.name = record.name;
    this.summary = record.summary;
    this.value = record.value ?? null;
    Object.freeze(this);
  }

  /** Every token that selects this flag, short aliases first. */
  names(): readonly string[] {
    return Object.freeze([...this.aliases, this.name]);
  }

  matches(token: string): boolean {
    return this.names().includes(token);
  }

  takesValue(): boolean {
    return this.value !== null;
  }

  /** The `--help` column form, such as `--repo <path>` or `-h, --help`. */
  synopsis(): string {
    const names = this.names().join(', ');
    return this.value === null ? names : `${names} ${this.value.synopsis}`;
  }
}

function requireFlagName(name: string): void {
  if (!name.startsWith('-')) {
    throw new Error(`CLI flag name must start with -: ${name}`);
  }
}
