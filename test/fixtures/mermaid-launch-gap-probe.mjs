import '../../scripts/RequireDockerTests.ts';
import process from 'node:process';
import puppeteer from 'puppeteer';
import { writeFile } from 'node:fs/promises';

async function stall(browser) {
  const marker = process.env['MERMAID_LAUNCH_GAP_MARKER'];
  if (marker === undefined) { throw new Error('Missing launch-gap marker'); }
  const pid = browser.process()?.pid ?? Number(process.argv[4]);
  await writeFile(marker, `${String(pid)}\nconnected`);
  await new Promise(() => {});
}

const launch = puppeteer.launch.bind(puppeteer);
puppeteer.launch = async (...args) => { return await stall(await launch(...args)); };
const connect = puppeteer.connect.bind(puppeteer);
puppeteer.connect = async (...args) => { return await stall(await connect(...args)); };
