#!/usr/bin/env python3
"""Count native Node starts from the real installed CLI; COPY Docker only."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

if not Path('/.dockerenv').exists():
    raise SystemExit('CLI process tests require Docker')
ROOT = Path.cwd()
WORK = Path(tempfile.mkdtemp(prefix='cli-process-', dir=os.environ['TMPDIR']))
TIMEOUT = 30

try:
    pack = WORK / 'pack'
    consumer = WORK / 'consumer'
    pack.mkdir()
    consumer.mkdir()
    subprocess.run(['node', 'scripts/package-payload/CheckPackagePayload.ts', '--pack-destination', str(pack)], check=True, timeout=TIMEOUT)
    subprocess.run(['npm', 'init', '-y'], cwd=consumer, stdout=subprocess.DEVNULL, check=True, timeout=TIMEOUT)
    subprocess.run(['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--fetch-retries=0', '--fetch-timeout=15000', str(next(pack.glob('*.tgz')))], cwd=consumer, stdout=subprocess.DEVNULL, check=True, timeout=TIMEOUT)
    preload = WORK / 'trace.cjs'
    preload.write_text("const fs=require('node:fs');const p=require('node:process');fs.appendFileSync(p.env.WARP_CLI_START_TRACE,[p.pid,p.ppid,p.argv[1]??''].join(String.fromCharCode(9))+String.fromCharCode(10));")
    wrapper = consumer / 'node_modules/@git-stunts/git-warp/bin/git-warp'
    cases = [
        ('help', ['--help'], 0),
        ('doctor', ['doctor', '--repo', str(consumer)], 3),
        ('json-failure', ['doctor', '--repo', str(WORK / 'missing'), '--json'], 3),
        ('unknown', ['no-such-command'], 1),
    ]
    for name, arguments, expected in cases:
        trace = WORK / (name + '.tsv')
        environment = os.environ.copy()
        environment['NODE_OPTIONS'] = '--require=' + str(preload)
        environment['WARP_CLI_START_TRACE'] = str(trace)
        result = subprocess.run(['node', str(wrapper), *arguments], cwd=consumer, env=environment, capture_output=True, text=True, timeout=TIMEOUT)
        rows = trace.read_text().splitlines()
        print('INSTALLED_CLI_PROCESS', name, 'node_starts', len(rows), 'exit', result.returncode, flush=True)
        if len(rows) != 1 or result.returncode != expected:
            raise AssertionError('Installed CLI process count or exit status changed: ' + name)
        if name == 'help' and (not result.stdout or result.stderr):
            raise AssertionError('Help streams changed')
        if name == 'json-failure' and (not result.stdout.startswith('{') or result.stderr):
            raise AssertionError('JSON failure streams changed')
        if name == 'unknown' and (result.stdout or 'Unknown command' not in result.stderr):
            raise AssertionError('Usage failure streams changed')
finally:
    shutil.rmtree(WORK)
