import { V18_MIGRATION_CLI_FLAGS } from './V18MigrationCliContract.ts';
import type V18MigrationCliFlag from './V18MigrationCliFlag.ts';
import { formatV18MigrationCliHelp } from './V18MigrationCliHelp.ts';
import V18MigrationExecutionMode from './V18MigrationExecutionMode.ts';

export type V18MigrationCliOptions = Readonly<{
  assumeYes: boolean;
  graph: string;
  json: boolean;
  mode: V18MigrationExecutionMode;
  recoveryId?: string;
  repositoryPath: string;
  scratchRoot?: string;
}>;

const flags = V18_MIGRATION_CLI_FLAGS;
/** Flags the parser accepts; help is answered before parsing. */
const PARSED_FLAGS: readonly V18MigrationCliFlag[] = Object.values(flags).filter(
  (flag) => flag !== flags.help
);

/** One parsed occurrence per flag; a repeated flag keeps its last value. */
type FlagValues = ReadonlyMap<V18MigrationCliFlag, string>;

export function isV18MigrationCliHelpRequest(args: readonly string[]): boolean {
  return args.some((arg) => flags.help.matches(arg));
}

/** Parses argv against the contract, refusing unknown or conflicting flags. */
export function parseV18MigrationCliOptions(args: readonly string[]): V18MigrationCliOptions {
  const values = readFlagValues(args);
  const target = requireTarget(values);
  if (values.has(flags.apply) && values.has(flags.dryRun)) {
    throw new Error(`${flags.apply.name} cannot be combined with ${flags.dryRun.name}`);
  }
  return Object.freeze({
    assumeYes: values.has(flags.yes),
    graph: target.graph,
    json: values.has(flags.json),
    mode: values.has(flags.dryRun)
      ? V18MigrationExecutionMode.rehearse()
      : V18MigrationExecutionMode.promote(),
    repositoryPath: target.repositoryPath,
    ...optionalValues(values),
  });
}

function requireTarget(values: FlagValues): Readonly<{ graph: string; repositoryPath: string }> {
  const repositoryPath = values.get(flags.repo);
  const graph = values.get(flags.graph);
  if (repositoryPath === undefined || graph === undefined) {
    throw new Error(
      `${flags.repo.name} and ${flags.graph.name} are required\n\n${formatV18MigrationCliHelp()}`
    );
  }
  return Object.freeze({ graph, repositoryPath });
}

function optionalValues(values: FlagValues): Readonly<{ recoveryId?: string; scratchRoot?: string }> {
  const recoveryId = values.get(flags.recoveryId);
  const scratchRoot = values.get(flags.scratchRoot);
  return Object.freeze({
    ...(recoveryId === undefined ? {} : { recoveryId }),
    ...(scratchRoot === undefined ? {} : { scratchRoot }),
  });
}

function readFlagValues(args: readonly string[]): FlagValues {
  const values = new Map<V18MigrationCliFlag, string>();
  const tokens = args[Symbol.iterator]();
  for (let next = tokens.next(); next.done !== true; next = tokens.next()) {
    const flag = requireFlag(next.value);
    values.set(flag, flag.takesValue() ? requireValue(flag, tokens.next().value) : '');
  }
  return values;
}

function requireFlag(arg: string): V18MigrationCliFlag {
  const flag = PARSED_FLAGS.find((candidate) => candidate.matches(arg));
  if (flag === undefined) {
    throw new Error(`unknown argument: ${arg}`);
  }
  return flag;
}

function requireValue(flag: V18MigrationCliFlag, value: string | undefined): string {
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag.name} requires a value`);
  }
  if (value === '') {
    throw new Error(`${flag.name} requires a non-empty value`);
  }
  return value;
}
