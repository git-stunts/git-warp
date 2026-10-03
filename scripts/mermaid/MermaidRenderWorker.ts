import { run } from '@mermaid-js/mermaid-cli';
import puppeteer from 'puppeteer';
import { formatFailure } from '../formatFailure.ts';

function browserEndpoint(): Promise<string> {
  return new Promise((resolve, reject) => {
    process.on('message', message => {
      if (typeof message === 'string' && message.startsWith('endpoint:ws://')) {
        resolve(message.slice('endpoint:'.length));
      } else { reject(new Error('Mermaid browser connection cancelled or invalid')); }
    });
    process.send?.('ready');
  });
}

async function render(): Promise<void> {
  const [input, output] = process.argv.slice(2);
  if (input === undefined || output === undefined || !output.endsWith('.md')) {
    throw new Error('Mermaid worker requires Markdown input and output paths');
  }
  const browser = await puppeteer.connect({ browserWSEndpoint: await browserEndpoint() });
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
    }
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
  process.disconnect?.();
}
