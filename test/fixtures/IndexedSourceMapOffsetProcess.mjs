import process from 'node:process';
import { SourceMapConsumer, SourceNode } from 'source-map-js';

// Exercise the vendor's string transport, including its indexed-map runtime form.
const wire = '{"version":3,"sections":[{"offset":{"line":1000000,"column":0},"map":{"version":3,"sources":["source.ts"],"sourcesContent":["value\\n"],"names":[],"mappings":"AAAA"}}]}';
const consumer = new SourceMapConsumer(wire);
const code = 'value\n';
process.stdout.write(SourceNode.fromStringWithSourceMap(code, consumer).toString());
