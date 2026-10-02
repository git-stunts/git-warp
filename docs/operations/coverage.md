# Coverage runs and threshold updates

Run coverage through the COPY-based Docker commands:

```bash
npm run test:coverage
npm run test:coverage:ci
```

Both commands run the unit suite, v18 Optic conformance tests and the entity
admission inventory integration test. Instrumented execution uses one worker
and one coverage-processing task at a time. This deliberately trades parallel
throughput for predictable startup pressure; the normal unit runner retains its
separate worker policy. Test, worker-start and teardown deadlines are unchanged.

Only an argument-free `npm run test:coverage` can raise the committed line
threshold. Vitest's own automatic configuration writes are always disabled.
The runner first verifies a nonempty selected manifest, a terminal result for
every selected file, at least one passing test, zero unhandled errors and a
successful teardown. It then validates the fresh coverage summary and raises
the line threshold only when coverage improves. Ambiguous configuration,
invalid reports or a configuration edited during the run refuse the update.

`npm run test:coverage:ci` and coverage commands with extra arguments report
coverage without updating thresholds. For example:

```bash
npm run test:coverage -- test/unit/scripts/coverage-ratchet.test.ts \
  --coverage.include=scripts/coverage-ratchet.ts --coverage.thresholds.lines=0
```

A partial selection never becomes a full-suite ratchet measurement. An empty
selection, incomplete manifest, failed assertion, worker launch error or
teardown error exits unsuccessfully and leaves thresholds unchanged. Deliberate
skipped tests are retained in the report; a selection with no passing test is
not accepted as a complete measurement.

The Docker exporter additionally applies a successful candidate only while the
host configuration still matches its pre-run baseline. Failed or conflicting
candidates remain under `.ratchet/docker-results/` for inspection. Exported
coverage files are diagnostic evidence; their presence alone is not proof of a
successful run.

A worker that still cannot start within Vitest's deadline remains a failed run.
The concurrency cap reduces simultaneous instrumentation pressure; it does not
guarantee success under arbitrary external resource exhaustion.
