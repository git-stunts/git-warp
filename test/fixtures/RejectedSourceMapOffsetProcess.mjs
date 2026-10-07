import process from 'node:process';
import { SourceMapConsumer } from 'source-map-js';

const wire = '{"version":3,"sections":[{"offset":{"line":9007199254740991,"column":0},"map":{"version":3,"sources":["source.ts"],"names":[],"mappings":"AAAA"}}]}';
let result = 'accepted';
try { new SourceMapConsumer(wire); }
catch { result = 'refused'; }
process.stdout.write(result + '\n');
