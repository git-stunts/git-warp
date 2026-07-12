# Observers

An **observer** is a read surface that answers questions through an **aperture**
- a policy that bounds *what* a reader is allowed to see. Where an
[optic read](optic-reads.md) bounds the *question*, an observer bounds
*visibility*.

## Apertures

An aperture is a small policy object (`src/domain/types/Aperture.ts`):

```typescript
type Aperture = {
  match: string | string[];   // glob(s) selecting which entities are in view
  expose?: string[];          // property whitelist; omitted = all non-redacted
  redact?: string[];          // property blacklist; takes precedence over expose
};
```

## Creating an observer

```typescript
const publicAperture = {
  match: ['task:*', 'service:*'],
  redact: ['internalNotes', 'exploitSteps'],
};

const publicView = await events.observer('public-review', publicAperture);
const visibleTask = await publicView.getNodeProps('task:auth');
```

`observer(config)` and `observer(name, config)` both return an `Observer`
(`src/domain/WarpWorldline.ts`). An observer exposes the normal read, query, and
traversal methods, but every result is filtered through the aperture.

## When to use observers

- **Redaction** — hide sensitive properties from a view.
- **Tenant scoping** — restrict a reader to one tenant's entities.
- **Role-specific views** — present a public or limited surface of a worldline.

Observers express product boundaries. They are not a substitute for the
authority/capability proofs handled upstream (e.g. Wesley/Edict contracts); an
aperture says what a *reading* shows, not what an *operation* is permitted to do.

Observer redaction is also not encryption. It hides fields from the selected
read path, but it does not rewrite patch history, delete Git objects, or prevent
a local operator from inspecting raw objects. Use vault-backed CAS content
encryption when stored bytes need protection at rest; see
[Content and CAS](content-and-cas.md).

## See also

- [Optic reads](optic-reads.md)
- [Querying](querying.md)
- [Content and CAS](content-and-cas.md)
