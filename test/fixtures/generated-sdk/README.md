# Generated SDK fixture

`users.graphql` is the single authored source for this fixture. Wesley emits
the request types and operation metadata in `users.wesley.generated.ts`; the
git-warp fixture renderer verifies those directives and emits
`users.generated.ts`.

Regenerate with Wesley `0.3.0-alpha.1`:

```bash
npm run generate:sdk-fixture
```

CI installs Wesley from commit
`4891a631f888c5b2f70e117e3704538dd1362c2f`, rejects byte drift in both
generated files, compiles them against the packed package, and runs the SDK
against a disposable real-Git repository.

The fixture contains source files only. Its Git repository, package install,
checkpoint, and runtime data are created under a temporary directory and are
never checked in.
