import { run } from '@mermaid-js/mermaid-cli';
import puppeteer from 'puppeteer';
import { dirname, join } from 'node:path';
import { formatFailure } from '../formatFailure.ts';

const launchCancellation = new AbortController();
process.on('message', message => {
  if (message === 'abort') { launchCancellation.abort(); }
});

async function render(): Promise<void> {
  const [input, output] = process.argv.slice(2);
  if (input === undefined || output === undefined || !output.endsWith('.md')) {
    throw new Error('Mermaid worker requires Markdown input and output paths');
  }
  const browser = await puppeteer.launch({
    userDataDir: join(dirname(output), 'browser-profile'),
    signal: launchCancellation.signal,
    handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
    args: process.env['GIT_WARP_MERMAID_DISABLE_SANDBOX'] === '1'
      ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
  });
  const browserPid = browser.process()?.pid;
  if (browserPid === undefined) { throw new Error('Mermaid browser has no owned process'); }
  process.send?.(`browser:${String(browserPid)}`);
  try {
    await run(input, requireMarkdownPath(output), { browser, quiet: true });
  } catch (error) {
    process.send?.(`render-failed:${formatFailure(error)}`);
    process.exitCode = 1;
  } finally {
    process.send?.('shutdown');
    try { await browser.close(); }
    catch (error) {
      process.send?.(`shutdown-failed:${formatFailure(error)}`);
      process.exitCode = 1;
    } finally { launchCancellation.abort(); }
  }
}

function requireMarkdownPath(path: string): `${string}.md` {
  if (!path.endsWith('.md')) { throw new Error('Mermaid output must end in .md'); }
  // Construct the suffix rather than asserting the external library's template type.
  return `${path.slice(0, -3)}.md`;
}

try { await render(); }
catch (error) {
  process.stderr.write(`Mermaid render failed: ${formatFailure(error)}\n`);
  process.exitCode = 1;
} finally {
  launchCancellation.abort();
  process.disconnect?.();
}
