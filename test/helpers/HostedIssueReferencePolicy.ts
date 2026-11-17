// Runs the hosted `PR Issue Reference` policy script itself, so a local check
// accepts exactly the reference forms that the required GitHub check accepts.
// The script comes from .github/workflows/pr-issue-reference.yml and runs in a
// fresh vm context. Its webhook event, GitHub API, console and exit are stubs.
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createContext, runInContext } from 'node:vm';
import { parseDocument } from 'yaml';

const WORKFLOW = '.github/workflows/pr-issue-reference.yml';
const POLICY_STEP = Object.freeze(['jobs', 'require-issue-reference', 'steps', 0, 'run']);
const NODE_HEREDOC = /^node <<'NODE'\n(?<program>[\s\S]*?)\nNODE$/mu;
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

  /** Reads the policy script from the first step of the hosted workflow. Fails closed when it moved. */
  static fromWorkflow(workflow: string = readFileSync(WORKFLOW, 'utf8')): HostedIssueReferencePolicy {
    const run = parseDocument(workflow).getIn(POLICY_STEP);
    const program = typeof run === 'string' ? NODE_HEREDOC.exec(run)?.groups?.['program'] : undefined;
    if (program === undefined) throw new Error(`${WORKFLOW} has no node <<'NODE' policy script in its first step`);
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
