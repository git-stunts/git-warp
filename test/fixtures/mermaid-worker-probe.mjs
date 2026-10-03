import '../../scripts/RequireDockerTests.ts';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const [mode, marker] = process.argv.slice(2);
if (marker === undefined) { throw new Error('Missing worker probe marker'); }
process.on('message', () => {});

if (mode === 'invalid-message') { process.send?.({ invalid: true }); }
else if (mode === 'invalid-pid') { process.send?.('browser:NaN'); }
else if (mode === 'ready-without-browser') { process.send?.('ready'); }
else if (mode === 'unexpected-message') { process.send?.('unrecognized'); }
else if (mode === 'exit-before-render') { process.disconnect?.(); }
else {
  // A detached browser surrogate and its child demonstrate group ownership,
  // including descendants that survive the worker's successful exit.
  const browser = spawn(process.execPath, ['-e', `
    const { spawn } = require('node:child_process');
    spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    setInterval(() => {}, 1000);
  `], { detached: true, stdio: 'ignore' });
  await writeFile(marker, String(browser.pid));
  process.send?.(`browser:${String(browser.pid)}`);
  if (['render-failure', 'both-failures', 'failed-render-shutdown-stall'].includes(mode)) {
    process.send?.('render-failed:controlled invalid diagram');
  }
  if (mode === 'stderr-failure') { process.stderr.write('controlled worker crash'); }
  if (!['render-stall', 'stderr-failure'].includes(mode)) { process.send?.('shutdown'); }
  if (['close-error', 'both-failures'].includes(mode)) { process.send?.('shutdown-failed:controlled close error'); }
  if (['success', 'render-failure', 'shutdown-failure', 'close-error', 'both-failures', 'stderr-failure'].includes(mode)) {
    process.exitCode = mode === 'success' ? 0 : 1;
    process.disconnect?.();
    browser.unref();
  }
}
