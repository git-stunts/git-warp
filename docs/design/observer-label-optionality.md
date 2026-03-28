# Observer Label Optionality

Status: IMPLEMENTED

Legend: Observer Geometry

Cycle: OG-010

## Problem

The current public observer API requires a name argument:

- `graph.observer(name, config, options?)`
- `worldline.observer(name, config)`

That label has lightweight semantics today:

- it is exposed as `observer.name`
- it is reused when the observer seeks

But for first-use and ordinary application-facing reads, forcing every call site
to invent a label is unnecessary friction. It makes Quick Start examples look
more ceremonial than the underlying read model actually is.

## Decision

Support both public call shapes:

- `observer(config)`
- `observer(name, config)`

When the caller omits the label, the observer receives a stable default name:

- `observer.name === 'observer'`

That preserves the existing identity semantics without making the label
mandatory for normal reads.

## Sponsor Playback

### Sponsor Human

An application developer should be able to:

- create an observer without inventing a label on day one
- add a descriptive label later when it helps debugging or UI semantics
- trust that unlabeled observers still have a stable `name`

### Sponsor Agent

A coding agent should be able to infer:

- the unlabeled form is the default ergonomic path
- labels are optional metadata, not a required part of the read model
- both overloads are public and supported

## Scope

This slice includes:

- `WarpRuntime.observer(...)`
- `Worldline.observer(...)`
- public type signatures
- consumer type fixture
- first-use public docs where the required label currently creates friction

This slice does not:

- remove `observer.name`
- remove support for descriptive labels
- introduce a separate `label` options field

## Tests As Spec

The executable spec for this slice should prove:

1. `graph.observer(config)` works
2. `worldline.observer(config)` works
3. unlabeled observers default `name` to `'observer'`
4. `seek()` preserves that default label
5. the public type surface declares both overloads
6. the consumer type fixture compiles against both forms
