# h-ops — snapshot/drift deferred-minors cleanup — design spec

**Date:** 2026-06-30
**Status:** Approved (brainstorming) — pending implementation plan
**Branch:** `fix/snapshot-drift-deferred-minors` (off `main`)

## Goal

Close the four remaining **standing Minors** deferred from the `feat/snapshot-drift` branch
(recorded in `.superpowers/sdd/progress.md`, line 46). These are quality-polish items in the
snapshot/drift subsystem: a naming smell, a real test-coverage gap, a misleading summary count,
and a vacuous test assertion. None changes the observable behavior of `snapshot`/`drift`/`accept`
on a host — they raise code clarity, test strictness, and message accuracy.

The test suite is **55/55 green** at the start of this work; it must stay green (with new/strengthened
tests added).

## Scope (chosen during brainstorming)

All four deferred items, plus the commit-trailer convention applied to this work's own commits:

| # | Item | Location | Nature |
|---|------|----------|--------|
| 1 | `alias` variable shadows the bash `alias` builtin | `scripts/snapshot.sh:9,12` | Cosmetic rename |
| 2 | "state/ exists but NOT writable" branch is untested | `src/commands/doctor.js:53-57` / `test/doctor.test.js` | Real coverage gap |
| 3 | "passed/total" summary counts non-fatal checks, contradicting `ok` | `src/commands/doctor.js:62-64` | Misleading message |
| 4 | grammar-sync test-2 section-word assertions are vacuous | `test/snapshot-docs.test.js:26-28` | Weak test guard |
| 5 | commit trailer | (process) | Apply `Co-Authored-By` to this work's commits |

## Non-goals (YAGNI)

- **No host-behavior change.** snapshot.sh's emitted grammar, doctor's return shape
  (`{ ok, checks }`), and the drift/accept flows stay identical.
- **No history rewrite** for item #5 — past branch commits keep their (trailer-less) messages;
  only new commits on this branch carry the trailer.
- **No re-opening of already-resolved/debunked items:** T1(a) [CONTAINERS daemon-access] was fixed
  in `e7a46ca`; T1(b) [NETWORK.LISTENING pipefail] was debunked (remote heredoc has no `set`, so
  the `ss||netstat` pipe does not run under pipefail). Neither is in scope.

## Decisions (locked during brainstorming)

| Decision | Choice |
|----------|--------|
| #2 test mechanism | **Mock `fs.accessSync` to throw** via `node:test`'s `mock.method`. Deterministic and uid-independent — `chmod 0o500` is **bypassed by root**, so it would give a false-green under a root CI runner. |
| #3 summary wording | Headline reflects **required (fatal) checks** so it agrees with the `ok` verdict; non-fatal failures are surfaced separately as advisories: `N/M required checks passed (K advisory warning[s]).` |
| #4 strengthening | Replace word-presence checks with a **real consistency guard**: assert the `accept --only` section list is documented *and* that it matches exactly the top-level keys of the State JSON schema block. |
| Branch | New branch `fix/snapshot-drift-deferred-minors` off `main` (no committing straight to default). |

## Detailed design

### #1 — Rename `alias` → `ssh_alias` (snapshot.sh)

Rename the positional-arg variable at [snapshot.sh:9](../../../scripts/snapshot.sh) and its two
uses at [:12](../../../scripts/snapshot.sh) (the `ssh ... "$alias"` invocation and the
`UNREACHABLE: $alias` message). The remote block is a single-quoted heredoc (`<<'EOF'`), so it
contains no `$alias` expansion — the rename touches only the 3 outer-script lines.

- **Behavior:** unchanged. The existing `snapshot-script.test.js` (usage exit-2, `bash -n`, heredoc
  validity, markers present) keeps passing.
- **Verify:** `bash -n scripts/snapshot.sh` + full suite. No new test needed (behavior is invariant).

### #2 — Test the "state/ exists but NOT writable" branch (doctor.test.js)

The branch at [doctor.js:53-57](../../../src/commands/doctor.js) — where `state/` exists but
`fs.accessSync(W_OK)` throws, producing a check with `ok:false, fatal:false` that must **not** flip
the overall verdict — has no direct test today.

New test in `test/doctor.test.js`:
- Set up a skillDir whose `state/` dir exists.
- Use `mock.method(fs, 'accessSync', () => { throw Object.assign(new Error('EACCES'), { code: 'EACCES' }); })`
  (restored via `t.mock`/`mock.restoreAll()` after) so the not-writable branch is hit deterministically.
- Assert: `stateCheck.ok === false`, `stateCheck.fatal === false`, `r.ok === true`, and
  `stateCheck.label` matches `/NOT writable/`.

This locks the contract that a non-writable `state/` is advisory only.

### #3 — Fix the "passed/total" summary (doctor.js)

Today [doctor.js:62-64](../../../src/commands/doctor.js) computes `passed = checks.filter(c => c.ok)`
across **all** checks, so a non-writable `state/` renders e.g. "8/9 checks passed" while `r.ok` is
still `true` (because `failed` counts only fatal) — reads as a contradiction.

Change the summary so the headline ratio is over **fatal (required)** checks (consistent with how
`ok` is derived) and non-fatal failures are reported separately:

```
N/M required checks passed (K advisory warning[s]).
```

- `K` omitted entirely when there are no non-fatal failures (clean output for the normal case).
- Singular/plural on "warning".
- **`return { ok, checks }` shape is unchanged** — only the logged string changes.

Test: `doctor` already accepts an injected `log`. Add a test that passes a log-capturing spy in the
non-writable scenario (reuse #2's mock) and asserts the summary line contains "required checks passed"
and "1 advisory warning", while `r.ok === true`. Existing tests assert only `r.ok`/`r.checks`, so the
wording change does not break them.

### #4 — Strengthen grammar-sync test-2 (snapshot-docs.test.js)

Replace the four vacuous `docs.includes('containers'/'network'/'access'/'system')` assertions at
[snapshot-docs.test.js:26-28](../../../test/snapshot-docs.test.js) (those words appear throughout
operations.md regardless of correctness) with a genuine internal-consistency guard:

- Assert operations.md documents the `accept` command with the `--only <section>` form.
- Extract the section set enumerated for `accept --only`
  (`section ∈ {containers, network, access, system}`) and assert it **equals** the top-level keys
  of the fenced State JSON schema block (minus the metadata keys `server`, `captured_at`).

This makes the test guard the real invariant — *the documented `--only` sections are exactly the
schema's top-level sections* — instead of mere word presence. The regex/parse will be tolerant of
harmless reformatting (match backticked tokens / parse the fenced ` ```json ` block), not brittle to
whitespace. Keep test-1 (markers) and the `DRIFT:{0,1,2}` regex as-is — they remain the primary guards.

### #5 — Commit trailer

Every commit on this branch ends with:

```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

No history rewrite of prior branches.

## Implementation order & verification

Each item is a small, independent unit. TDD where it applies:

1. **#1** rename → `bash -n` + `npm test` (existing tests cover it).
2. **#2** write the failing-for-the-right-reason not-writable test → confirm it exercises the branch → `npm test`.
3. **#3** add the log-capture assertion (red against current wording) → change the summary string → `npm test`.
4. **#4** rewrite test-2 to the consistency guard (must fail if the doc's `--only` set and schema keys
   diverge) → confirm green against current (consistent) docs → `npm test`.

Final gate: full suite green — expected **≥ 57** (55 existing + new #2 test + new/!strengthened #3
assertion; #4 replaces in place). Run `bash -n` on snapshot.sh once more.

## Ledger update

On completion, append a "deferred Minors RESOLVED" entry to `.superpowers/sdd/progress.md` recording
which items were closed and how, so the ledger reflects an empty deferred list.
