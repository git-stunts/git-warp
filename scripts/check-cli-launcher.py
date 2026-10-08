#!/usr/bin/env python3
"""Bounded native launcher behavior tests; run only in the COPY Docker worker."""
from pathlib import Path
import os
import shutil
import signal
import subprocess
import tempfile

if not Path('/.dockerenv').exists():
    raise SystemExit('CLI launcher tests require Docker')
ROOT = Path.cwd()
NODE = shutil.which('node')
if NODE is None:
    raise SystemExit('Node is required in the validation worker')
WORK = Path(tempfile.mkdtemp(prefix='cli-launcher-', dir=os.environ['TMPDIR']))
TIMEOUT = 20
COVERAGE = WORK / 'coverage'
COVERAGE.mkdir()
os.environ['NODE_V8_COVERAGE'] = str(COVERAGE)

def run(command, cwd, **options):
    return subprocess.run(command, cwd=cwd, timeout=TIMEOUT, capture_output=True, text=True, **options)

def layout(name):
    at = WORK / name
    (at / 'bin').mkdir(parents=True)
    (at / 'package.json').write_text('{"type":"module"}\n')
    shutil.copyfile(ROOT / 'bin/git-warp', at / 'bin/git-warp')
    return at

def entry(at, source, development=False):
    path = at / ('bin/git-warp.ts' if development else 'dist/bin/git-warp.js')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(source)
    return path

def require(condition, message):
    if not condition:
        raise AssertionError(message)

try:
    at = layout('directory with spaces')
    entry(at, "process.stdout.write('ARGS '+process.argv.slice(2).join('|'));process.stderr.write('ERR');process.exitCode=7;")
    entry(at, "throw new Error('wrong source entry');", development=True)
    result = run([NODE, str(at / 'bin/git-warp'), 'a b', '--json', 'λ'], at)
    require((result.returncode, result.stdout, result.stderr) == (7, 'ARGS a b|--json|λ', 'ERR'), 'argv/stdout/stderr/exit or dist priority changed')
    (at / 'symlink').symlink_to(at / 'bin/git-warp')
    result = run([NODE, str(at / 'symlink'), 'symlink'], at)
    require(result.returncode == 7 and result.stdout == 'ARGS symlink', 'symlink/path selection failed')
    print('LAUNCHER_BOUNDARY packed-selection-spaces-argv-streams-status-symlink PASS', flush=True)

    at = layout('development')
    entry(at, "const value: string = 'SOURCE';process.stdout.write(value);", development=True)
    result = run([NODE, str(at / 'bin/git-warp')], at)
    require(result.returncode == 0 and result.stdout == 'SOURCE', 'documented source TypeScript fallback failed')
    print('LAUNCHER_BOUNDARY source-selection PASS', flush=True)

    at = layout('missing')
    result = run([NODE, str(at / 'bin/git-warp')], at)
    require(result.returncode == 1 and result.stderr == 'git-warp CLI entry point is unavailable\n' and result.stdout == '', 'missing-entry refusal changed')
    at = layout('module-load-failure')
    entry(at, "throw new Error('selected module failed');")
    result = run([NODE, str(at / 'bin/git-warp')], at)
    require(result.returncode == 1 and result.stderr == 'selected module failed\n' and result.stdout == '', 'load failure was swallowed or misclassified')
    at = layout('non-error-load-failure')
    entry(at, "throw 'non-error module failed';")
    result = run([NODE, str(at / 'bin/git-warp')], at)
    require(result.returncode == 1 and result.stderr == 'non-error module failed\n' and result.stdout == '', 'non-Error load failure was lost')
    print('LAUNCHER_BOUNDARY missing-and-load-failure PASS', flush=True)

    at = layout('stdin')
    entry(at, "process.stdin.setEncoding('utf8');process.stdin.on('data',v=>process.stdout.write(v));")
    result = run([NODE, str(at / 'bin/git-warp')], at, input='input with spaces\nλ\n')
    require(result.returncode == 0 and result.stdout == 'input with spaces\nλ\n', 'stdin was not inherited')
    print('LAUNCHER_BOUNDARY stdin PASS', flush=True)

    for stop in [signal.SIGINT, signal.SIGTERM]:
        at = layout('signal-' + str(stop.value))
        marker = at / 'cleanup'
        entry(at, "import {writeFileSync} from 'node:fs';const timer=setInterval(()=>{},1000);for(const name of ['SIGINT','SIGTERM'])process.once(name,()=>{writeFileSync(process.argv[2],name);clearInterval(timer);process.exitCode=0;});process.stdout.write('READY\\n');")
        process = subprocess.Popen([NODE, str(at / 'bin/git-warp'), str(marker)], cwd=at, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
        try:
            import selectors
            ready = selectors.DefaultSelector()
            ready.register(process.stdout, selectors.EVENT_READ)
            require(bool(ready.select(TIMEOUT)), 'signal fixture did not become ready')
            require(process.stdout.readline() == 'READY\n', 'signal readiness corrupted')
            ready.close()
            os.kill(process.pid, stop)
            output, error = process.communicate(timeout=TIMEOUT)
            require(process.returncode == 0 and marker.read_text() == stop.name and error == '', 'signal was not delivered to selected entry or cleanup failed')
        finally:
            # A wrapper may die before its child. Reap the whole owned group
            # even when the parent already has an exit status.
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait(timeout=5)
    print('LAUNCHER_BOUNDARY SIGINT-SIGTERM-cleanup PASS', flush=True)
    import json
    reports = []
    boundaries = set()
    for report in COVERAGE.glob('*.json'):
        for script in json.loads(report.read_text())['result']:
            if not script['url'].endswith('/bin/git-warp'):
                continue
            ranges = [interval for function in script['functions'] for interval in function['ranges']]
            reports.append(ranges)
            boundaries.update(offset for interval in ranges for offset in [interval['startOffset'], interval['endOffset']])
    segments = list(zip(sorted(boundaries), sorted(boundaries)[1:]))
    uncovered = []
    for start, end in segments:
        visits = []
        for ranges in reports:
            containing = [interval for interval in ranges if interval['startOffset'] <= start and interval['endOffset'] >= end]
            if containing:
                # V8 omits redundant child ranges; a segment inherits its
                # innermost enclosing count in each individual execution.
                smallest = min(containing, key=lambda interval: interval['endOffset'] - interval['startOffset'])
                visits.append(smallest['count'])
        if visits and max(visits) == 0:
            uncovered.append((start, end))
    print('LAUNCHER_V8_UNCOVERED_SEGMENTS', uncovered, flush=True)
    require(bool(reports) and not uncovered, 'A launcher V8 segment is unexecuted')
    print('LAUNCHER_V8_SEGMENTS_ALL_EXECUTED', len(segments), 'executions', len(reports), flush=True)

finally:
    shutil.rmtree(WORK)
