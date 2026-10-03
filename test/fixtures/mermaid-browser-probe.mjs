import '../../scripts/RequireDockerTests.ts';
import process from 'node:process';
import puppeteer from 'puppeteer';
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function observeBrowser(browser) {
  const close = browser.close.bind(browser);
  browser.close = async () => {
    const marker = process.env['MERMAID_BROWSER_PROBE'];
    if (marker === undefined) { throw new Error('Missing browser probe marker'); }
    let diagrams = 0;
    for (const name of await readdir(tmpdir())) {
      if (name.startsWith('git-warp-mermaid-validation-')) {
        diagrams += (await readdir(join(tmpdir(), name))).filter(path => path.endsWith('.svg')).length;
      }
    }
    await writeFile(marker, `${String(browser.process()?.pid ?? Number(process.argv[4]))}\n${String(diagrams)}`);
    if (process.env['MERMAID_BROWSER_PROBE_MODE'] === 'close-stall') {
      await new Promise(() => {});
    } else {
      await close();
    }
  };
  return browser;
}

const launch = puppeteer.launch.bind(puppeteer);
const connect = puppeteer.connect.bind(puppeteer);
puppeteer.launch = async (...args) => observeBrowser(await launch(...args));
puppeteer.connect = async (...args) => observeBrowser(await connect(...args));
