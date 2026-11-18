// Runs the hosted `PR Issue Reference` policy script itself, so a local check
// accepts exactly the reference forms that the required GitHub check accepts.
// The script comes from .github/workflows/pr-issue-reference.yml and runs in a
// fresh vm context. Its webhook event, GitHub API, console and exit are stubs.
// The harness models only a job whose one bash step runs that script and nothing
// else. It refuses any other job shape, and any YAML error, so a workflow edit
// that the harness cannot run fails the local tests instead of passing them.
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createContext, runInContext } from 'node:vm';
import { isMap, isSeq, parseDocument, type Document, type YAMLMap } from 'yaml';

const WORKFLOW = '.github/workflows/pr-issue-reference.yml';
const POLICY_JOB = Object.freeze(['jobs', 'require-issue-reference']);
// The settings of the policy job and of its one step, sorted. Another setting, such as `if` or
// `continue-on-error`, changes when the job runs or what its result means, so it is not modelled.
const POLICY_JOB_SETTINGS = 'runs-on,steps';
const POLICY_STEP_SETTINGS = 'env,name,run,shell';
// The step environment: the token binding only. Another variable, such as NODE_OPTIONS, changes how Node runs.
const POLICY_ENVIRONMENT = 'GITHUB_TOKEN';
const POLICY_TOKEN = '${{ github.token }}';
// The whole run block: strict mode, a blank line, then the Node program and nothing else. No `m` flag.
const POLICY_RUN = /^set -euo pipefail\n\nnode <<'NODE'\n(?<program>[\s\S]*)\nNODE\n?$/u;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

/** The pull request fields that the hosted policy reads from its webhook event. */
export type PullRequestText = Readonly<{ number: number; title: string; body: string }>;

/** The stubbed GitHub API: these numbers are issues or pull requests; every other number is 404. */
export type IssueDirectory = Readonly<{ issues: readonly number[]; pullRequests: readonly number[] }>;

/** What the hosted script passes to console.log and console.error: messages, or a caught error. */
type ConsoleValue = string | Error;
type ClientRequestStub = Readonly<{ on: () => undefined; end: () => void }>;
type FsStub = Readonly<{ readFileSync: () => string }>;
type HttpsStub = Readonly<{
  request: (options: Readonly<{ path: string }>, callback: (response: StubbedApiResponse) => void) => ClientRequestStub;
}>;
type HostedGlobals = Readonly<{
  require: (specifier: string) => FsStub | HttpsStub;
  process: Readonly<{ env: Readonly<Record<string, string>>; exit: (code: number) => void }>;
  console: Readonly<{ log: (...values: readonly ConsoleValue[]) => void; error: (...values: readonly ConsoleValue[]) => void }>;
}>;

/** The sorted setting names of a YAML mapping. */
function settingsOf(map: YAMLMap): string {
  return map.items.map((pair) => String(pair.key)).sort().join(',');
}

/** Whether the step environment is exactly the token binding. */
function hasModelledEnvironment(step: YAMLMap): boolean {
  const env = step.get('env');
  return isMap(env) && settingsOf(env) === POLICY_ENVIRONMENT && env.get('GITHUB_TOKEN') === POLICY_TOKEN;
}

/** The Node program when the job has exactly the modelled shape; otherwise undefined. */
function policyProgram(document: Document): string | undefined {
  const job = document.getIn(POLICY_JOB);
  if (!isMap(job) || settingsOf(job) !== POLICY_JOB_SETTINGS) return undefined;
  const steps = job.get('steps');
  const step = isSeq(steps) && steps.items.length === 1 ? steps.items[0] : undefined;
  if (!isMap(step) || step.get('shell') !== 'bash' || !hasModelledEnvironment(step)) return undefined;
  return settingsOf(step) === POLICY_STEP_SETTINGS ? POLICY_RUN.exec(String(step.get('run')))?.groups?.['program'] : undefined;
}

/** One hosted-policy run: its exit code, the numbers it looked up, and its console lines, in order. */
export class HostedPolicyVerdict {
  readonly exitCode: number;
  readonly lookedUp: readonly number[];
  readonly output: readonly string[];

  constructor(exitCode: number, lookedUp: readonly number[], output: readonly string[]) {
    this.exitCode = exitCode;
    this.lookedUp = Object.freeze([...lookedUp]);
    this.output = Object.freeze([...output]);
    Object.freeze(this);
  }
}

/** A GitHub API response that the hosted script reads through `https.request`, an event emitter like `IncomingMessage`. */
class StubbedApiResponse extends EventEmitter {
  readonly statusCode: number;
  readonly #body: string;

  constructor(statusCode: number, body: string) {
    super();
    this.statusCode = statusCode;
    this.#body = body;
  }

  setEncoding(): void {}

  deliver(): void {
    this.emit('data', this.#body);
    this.emit('end');
  }
}

/** The process state of one run. Like a real exit, the first exit ends what the verdict records. */
class HostedRun {
  readonly #event: string;
  readonly #directory: IssueDirectory;
  readonly #lookedUp: number[] = [];
  readonly #output: string[] = [];
  #exitCode: number | null = null;

  constructor(repository: string, pullRequest: PullRequestText, directory: IssueDirectory) {
    // The webhook event is wire JSON that the hosted script parses.
    this.#event = JSON.stringify({ pull_request: pullRequest, repository: { full_name: repository } });
    this.#directory = directory;
  }

  globals(): HostedGlobals {
    const modules = new Map<string, FsStub | HttpsStub>([
      ['node:fs', { readFileSync: () => this.#event }],
      ['node:https', { request: this.#request.bind(this) }],
    ]);
    const record = (...values: readonly ConsoleValue[]): void => {
      if (this.#exitCode === null) this.#output.push(values.map(String).join(' '));
    };
    return {
      require: (specifier: string) => {
        const module = modules.get(specifier);
        if (module === undefined) throw new Error(`the hosted policy needs an unstubbed module: ${specifier}`);
        return module;
      },
      process: {
        env: { GITHUB_EVENT_PATH: 'event.json', GITHUB_TOKEN: 'stub-token' },
        exit: (code: number) => { this.#exitCode ??= code; },
      },
      console: { log: record, error: record },
    };
  }

  verdict(): HostedPolicyVerdict {
    if (this.#exitCode === null) throw new Error('the hosted policy finished without calling process.exit');
    return new HostedPolicyVerdict(this.#exitCode, this.#lookedUp, this.#output);
  }

  #request(options: Readonly<{ path: string }>, callback: (response: StubbedApiResponse) => void): ClientRequestStub {
    // The hosted script requests /repos/<owner>/<repo>/issues/<number>.
    const number = Number(options.path.split('/').pop());
    if (this.#exitCode === null) this.#lookedUp.push(number);
    const response = this.#respond(number);
    return {
      on: () => undefined,
      end: () => {
        callback(response);
        response.deliver();
      },
    };
  }

  #respond(number: number): StubbedApiResponse {
    if (this.#directory.issues.includes(number)) {
      return new StubbedApiResponse(HTTP_OK, `{"title":"Issue ${String(number)}"}`);
    }
    if (this.#directory.pullRequests.includes(number)) {
      return new StubbedApiResponse(HTTP_OK, `{"title":"Pull request ${String(number)}","pull_request":{}}`);
    }
    return new StubbedApiResponse(HTTP_NOT_FOUND, '{"message":"Not Found"}');
  }
}

export default class HostedIssueReferencePolicy {
  readonly #program: string;

  constructor(program: string) {
    this.#program = program;
    Object.freeze(this);
  }

  /** Reads the policy script from the hosted workflow. Fails closed when the job has a shape that the harness does not model. */
  static fromWorkflow(workflow: string = readFileSync(WORKFLOW, 'utf8')): HostedIssueReferencePolicy {
    // The yaml parser records errors, such as a duplicate key, and still returns a document.
    const document = parseDocument(workflow);
    const program = document.errors.length === 0 ? policyProgram(document) : undefined;
    if (program === undefined) {
      throw new Error(
        `${WORKFLOW} no longer has the shape that the harness models: YAML without errors, and a job with the ` +
        `settings ${POLICY_JOB_SETTINGS} and one bash step with the settings ${POLICY_STEP_SETTINGS}, whose env ` +
        `is ${POLICY_ENVIRONMENT}: ${POLICY_TOKEN} only, and whose run block is set -euo pipefail and the ` +
        "node <<'NODE' program only. Model the new shape in " +
        'test/helpers/HostedIssueReferencePolicy.ts.',
      );
    }
    return new HostedIssueReferencePolicy(program);
  }

  /** Runs the policy for a same-repository pull request. The stubs answer synchronously, so one turn settles it. */
  async evaluate(repository: string, pullRequest: PullRequestText, directory: IssueDirectory): Promise<HostedPolicyVerdict> {
    const run = new HostedRun(repository, pullRequest, directory);
    runInContext(this.#program, createContext(run.globals()));
    await nextTurn();
    return run.verdict();
  }
}
