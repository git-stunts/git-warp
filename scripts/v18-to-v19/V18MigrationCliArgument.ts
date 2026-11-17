import type V18MigrationCliFlag from './V18MigrationCliFlag.ts';
import type V18MigrationCliPlaceholder from './V18MigrationCliPlaceholder.ts';
import type { V18MigrationCliPlaceholderForm } from './V18MigrationCliPlaceholder.ts';

/** One flag of a canonical example, with its placeholder value when the flag takes one. */
export default class V18MigrationCliArgument {
  readonly flag: V18MigrationCliFlag;
  readonly value: V18MigrationCliPlaceholder | null;

  constructor(flag: V18MigrationCliFlag, value: V18MigrationCliPlaceholder | null = null) {
    if (flag.takesValue() !== (value !== null)) {
      throw new Error(`CLI example argument ${flag.name} must match whether the flag takes a value`);
    }
    this.flag = flag;
    this.value = value;
    Object.freeze(this);
  }

  render(form: V18MigrationCliPlaceholderForm): string {
    return this.value === null ? this.flag.name : `${this.flag.name} ${this.value.render(form)}`;
  }

  /** Concrete argv tokens; a placeholder must be bound. */
  argv(values: ReadonlyMap<V18MigrationCliPlaceholder, string>): readonly string[] {
    if (this.value === null) {
      return [this.flag.name];
    }
    const value = values.get(this.value);
    if (value === undefined) {
      throw new Error(`no execution value for placeholder ${this.value.literal}`);
    }
    return [this.flag.name, value];
  }
}
