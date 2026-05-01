# Precommit Sludge Guillotine

## Idea

Add the staged anti-sludge pre-commit hook discussed during the v17
deslugging work.

Suggested tone:

```txt
STOP. Look at this sludge.
Name it. Feel shame. Fix it.
```

## Why It Is Cool

Ridiculous, but effective. Sometimes the compiler needs a chair thrown
through a window.

## Guardrails

- Keep the hook thin and call a versioned script.
- Scan staged changes, not the whole working tree.
- Treat regex as the moat before architecture review, not the review.
- Do not block old sludge unless the patch touches or reintroduces it.
- Keep adapter/boundary exceptions explicit and narrow.
