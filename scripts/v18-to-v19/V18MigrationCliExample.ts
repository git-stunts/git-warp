import type V18MigrationCliArgument from './V18MigrationCliArgument.ts';
import {
  V18_MIGRATION_CLI_COMMAND as COMMAND,
  V18_MIGRATION_CLI_PACKAGE as PINNED_PACKAGE,
} from './V18MigrationCliIdentity.ts';
import type V18MigrationCliPlaceholder from './V18MigrationCliPlaceholder.ts';
import type { V18MigrationCliPlaceholderForm } from './V18MigrationCliPlaceholder.ts';

const CONTINUATION = ' \\\n  ';

/** One canonical invocation that every guide renders and every test can execute. */
export default class V18MigrationCliExample {
  readonly name: string;
  readonly args: readonly V18MigrationCliArgument[];

  constructor(name: string, args: readonly V18MigrationCliArgument[]) {
    if (name === '') {
      throw new Error('CLI example needs a name');
    }
    this.name = name;
    this.args = Object.freeze([...args]);
    Object.freeze(this);
  }

  /** The pinned `npm exec` form, one flag per continued line. */
  render(form: V18MigrationCliPlaceholderForm): string {
    const head = `npm exec --package=${PINNED_PACKAGE} -- ${COMMAND}`;
    return [head, ...this.args.map((argument) => argument.render(form))].join(CONTINUATION);
  }

  /** The installed-binary form used by output transcripts. */
  renderCommand(): string {
    return [COMMAND, ...this.args.map((argument) => argument.render('literal'))].join(' ');
  }

  /** Concrete argv for execution; every placeholder must be bound. */
  argv(values: ReadonlyMap<V18MigrationCliPlaceholder, string>): readonly string[] {
    return Object.freeze(this.args.flatMap((argument) => argument.argv(values)));
  }
}
