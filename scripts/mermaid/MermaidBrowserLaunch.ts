import MermaidBrowserCommand from './MermaidBrowserCommand.ts';
import puppeteer from 'puppeteer';
import { dirname, join } from 'node:path';

/** Bounds asynchronous argument preparation without starting a native process. */
export default class MermaidBrowserLaunch {
  constructor() { Object.freeze(this); }

  prepare(output: string, milliseconds: number, interruption: AbortSignal): Promise<MermaidBrowserCommand> {
    const args = puppeteer.defaultArgs({
      browser: 'chrome',
      userDataDir: join(dirname(output), 'browser-profile'),
      args: process.env['GIT_WARP_MERMAID_DISABLE_SANDBOX'] === '1'
        ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
    });
    const prepared = Promise.all([args, puppeteer.executablePath({ browser: 'chrome' })])
      .then(([arguments_, executable]) => new MermaidBrowserCommand(executable, arguments_));
    return new Promise((resolve, reject) => {
      const cleanup = (): void => { clearTimeout(timer); interruption.removeEventListener('abort', interrupted); };
      const interrupted = (): void => {
        cleanup(); reject(new Error(`Mermaid validation interrupted by ${String(interruption.reason)}`));
      };
      const timer = setTimeout(() => {
        cleanup(); reject(new Error('Mermaid render timed out during browser preparation'));
      }, milliseconds);
      interruption.addEventListener('abort', interrupted, { once: true });
      if (interruption.aborted) { interrupted(); }
      void prepared.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    });
  }
}
