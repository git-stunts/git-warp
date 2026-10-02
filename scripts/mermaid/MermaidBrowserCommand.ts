import { launch, type Process } from '@puppeteer/browsers';

/** Prepared launch command; launching returns native ownership synchronously. */
export default class MermaidBrowserCommand {
  readonly #executable: string;
  readonly #arguments: readonly string[];

  constructor(executable: string, args: readonly string[]) {
    if (executable.length === 0) { throw new Error('Mermaid browser executable must be nonempty'); }
    this.#executable = executable;
    this.#arguments = Object.freeze([...args]);
    Object.freeze(this);
  }

  launch(): Process {
    return launch({
      executablePath: this.#executable,
      args: [...this.#arguments, '--remote-debugging-port=0'], env: process.env,
      handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
    });
  }
}
