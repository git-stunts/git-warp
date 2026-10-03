// Simulate a host boundary inside the COPY test image, including forged flags.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const existsSync = fs.existsSync;
fs.existsSync = path => path === '/.dockerenv' ? false : existsSync(path);
syncBuiltinESMExports();
