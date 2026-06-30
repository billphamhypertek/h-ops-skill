# Snapshot/Drift Deferred-Minors Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four standing Minors deferred from `feat/snapshot-drift` — a naming smell, an untested branch, a misleading summary count, and a vacuous test — without changing any host-observable behavior.

**Architecture:** Four small, independent edits in the snapshot/drift subsystem. Three are pure quality polish guarded by tests; one (the doctor summary string) changes a logged line only. No production data structures or host-side grammar change. TDD where a behavior is asserted; rename + verify where behavior is invariant.

**Tech Stack:** Node.js ≥18.13 (built-in `node:test` runner + `node:test` mocking via the test context `t.mock`), Bash (POSIX-ish, `bash -n` syntax check), Markdown docs.

## Global Constraints

These apply to **every task** below; each task's requirements implicitly include this section.

- **No host-behavior change.** `snapshot.sh`'s emitted grammar, `doctor`'s return shape (`{ ok, checks }`), and the drift/accept flows stay byte-for-byte identical in behavior. Only a rename (invariant), a logged string, and test files change.
- **`doctor` return shape is `{ ok, checks }`** and `ok` stays `true` iff zero **fatal** checks failed. Only the logged summary string may change.
- **Test suite stays green.** It is 55/55 at branch start. Final expected count: **≥ 57** (55 existing + 1 new #2 test + 1 new #3 test; #4 is replaced in place, no count change).
- **Commit trailer.** Every commit created on this branch ends with exactly:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- **Branch:** `fix/snapshot-drift-deferred-minors` (off `main`, already the current branch). Never commit straight to `main`.
- **No history rewrite** of prior branches/commits. Only new commits carry the trailer.
- **Do not reopen resolved/debunked items:** T1(a) [CONTAINERS daemon-access] was fixed in `e7a46ca`; T1(b) [NETWORK.LISTENING pipefail] was debunked. Neither is in scope.
- **Test command:** `npm test` runs the whole suite (`node --test`). Single file: `node --test test/<file>`. Single test: `node --test --test-name-pattern='<substr>' test/<file>`.

---

## File Structure

Which files change, and what each is responsible for:

- **`scripts/snapshot.sh`** (modify, Task 1) — rename the positional-arg variable `alias` → `ssh_alias` on the 3 outer-script lines (lines 9 and 12). The single-quoted heredoc body is untouched (no `$alias` expansion inside it).
- **`src/commands/doctor.js`** (modify, Task 3) — replace the summary computation (lines 62–64) so the headline ratio is over **fatal (required)** checks and non-fatal failures are surfaced as advisories. `return { ok, checks }` unchanged.
- **`test/doctor.test.js`** (modify, Tasks 2 & 3) — add a not-writable-`state/` test that mocks `fs.accessSync` to throw (Task 2); add a log-capture test asserting the new summary wording (Task 3).
- **`test/snapshot-docs.test.js`** (modify, Task 4) — replace the four vacuous `docs.includes(<word>)` assertions with a real consistency guard: the documented `accept --only` section set must exactly equal the State JSON schema's top-level keys (minus metadata).
- **`.superpowers/sdd/progress.md`** (modify, Task 5) — append a "deferred Minors RESOLVED" ledger entry so the deferred list reads empty.

Tasks are independent; they may be implemented in any order, but the order below matches the spec's implementation order.

---

### Task 1: Rename `alias` → `ssh_alias` in snapshot.sh

**Files:**
- Modify: `scripts/snapshot.sh:9` and `scripts/snapshot.sh:12`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks rely on. Behavior is invariant; the existing `test/snapshot-script.test.js` (usage exit-2, `bash -n`, heredoc validity, markers present) is the guard.

**Why no new test:** the variable is internal to the outer script and never observed. The rename is cosmetic; existing tests already cover the script's behavior. The spec calls for `bash -n` + full suite as the verification.

- [ ] **Step 1: Rename the variable assignment and both uses**

In `scripts/snapshot.sh`, change line 9 from:

```bash
alias="$1"; shift
```

to:

```bash
ssh_alias="$1"; shift
```

And change line 12 from:

```bash
ssh "${SSH_OPTS[@]}" "$alias" bash -s -- "$@" <<'EOF' || { echo "UNREACHABLE: $alias" >&2; exit 1; }
```

to:

```bash
ssh "${SSH_OPTS[@]}" "$ssh_alias" bash -s -- "$@" <<'EOF' || { echo "UNREACHABLE: $ssh_alias" >&2; exit 1; }
```

Do **not** touch anything between the `<<'EOF'` line and the closing `EOF` — it is a single-quoted heredoc with no `$alias` expansion.

- [ ] **Step 2: Verify outer-script syntax**

Run: `bash -n scripts/snapshot.sh`
Expected: exit 0, no output.

- [ ] **Step 3: Run the snapshot-script suite to confirm behavior is unchanged**

Run: `node --test test/snapshot-script.test.js`
Expected: PASS — 4/4 tests (usage exit-2, `bash -n`, heredoc validity, markers emitted).

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — same count as branch start (55), all green.

- [ ] **Step 5: Commit**

```bash
git add scripts/snapshot.sh
git commit -m "refactor(snapshot): rename ssh-alias var to drop bash builtin shadow

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Test the "state/ exists but NOT writable" branch (doctor.test.js)

**Files:**
- Modify: `src/commands/doctor.js:51-60` (read-only reference — the branch under test; do **not** change it in this task)
- Test: `test/doctor.test.js` (add one test, after the existing `'doctor sees an existing writable state/ dir'` test)

**Interfaces:**
- Consumes: `doctor({ env, log, sshConfigPath })` from `src/commands/doctor.js` — returns `{ ok, checks }` where each check is `{ ok, label, fatal }`.
- Produces: nothing other tasks rely on. Task 3 reuses the same `fs.accessSync`-throws mock pattern.

**Context — the branch under test** (already correct in `doctor.js`; this task only adds coverage):

```js
const stateDir = path.join(skillDir, 'state');
if (fs.existsSync(stateDir)) {
  let writable = true;
  try { fs.accessSync(stateDir, fs.constants.W_OK); } catch { writable = false; }
  add(writable,
    writable ? `state/ writable (${stateDir})` : `state/ exists but is NOT writable (${stateDir})`,
    { fatal: false });
}
```

We force the `catch` branch by mocking `fs.accessSync` to throw — deterministic and uid-independent. `chmod 0o500` is **bypassed by root**, so it would give a false green under a root CI runner.

- [ ] **Step 1: Write the test WITHOUT the mock first (to prove the assertions bite)**

Append to `test/doctor.test.js`:

```js
test('doctor reports a non-writable state/ as advisory (does not flip the verdict)', (t) => {
  const cc = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-cc-'));
  const skillDir = path.join(cc, 'skills', 'h-ops');
  fs.mkdirSync(path.join(skillDir, 'state'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'x');
  const sshCfg = path.join(cc, 'ssh_config');
  fs.writeFileSync(sshCfg, '');

  const r = doctor({ env: { CLAUDE_CONFIG_DIR: cc }, log: () => {}, sshConfigPath: sshCfg });
  const stateCheck = r.checks.find((c) => /state\//.test(c.label));
  assert.ok(stateCheck, 'a state/ check is present');
  assert.equal(stateCheck.ok, false);
  assert.equal(stateCheck.fatal, false);
  assert.match(stateCheck.label, /NOT writable/);
  // advisory-only: the verdict is derived solely from fatal checks, so a
  // non-writable state/ can never flip it.
  assert.equal(r.ok, r.checks.filter((c) => c.fatal && !c.ok).length === 0);
});
```

Note: `t` (the test context) is used so we can attach an auto-restored mock in Step 3.

- [ ] **Step 2: Run it and confirm it FAILS for the right reason**

Run: `node --test --test-name-pattern='non-writable state/ as advisory' test/doctor.test.js`
Expected: FAIL — the real `state/` dir is writable, so `stateCheck.ok` is `true` and the label is `state/ writable …`; `assert.equal(stateCheck.ok, false)` and `assert.match(…, /NOT writable/)` fail. This proves the assertions exercise the not-writable branch rather than passing vacuously.

- [ ] **Step 3: Add the `fs.accessSync`-throws mock to force the branch**

Insert this block immediately **before** the `const r = doctor(...)` line in the new test:

```js
  // Force the "exists but NOT writable" branch deterministically — chmod 0o500
  // is bypassed by root, so a root CI runner would give a false green.
  t.mock.method(fs, 'accessSync', () => {
    throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
  });

```

The mock is auto-restored when the test ends (test-context mocking). It replaces only `fs.accessSync`; `fs.existsSync`/`fs.readFileSync`/`fs.constants` are untouched, and `readHosts` (which uses `fs.readFileSync`) is unaffected.

- [ ] **Step 4: Run it and confirm it PASSES**

Run: `node --test --test-name-pattern='non-writable state/ as advisory' test/doctor.test.js`
Expected: PASS — the mocked throw drives the catch branch: `stateCheck.ok === false`, `stateCheck.fatal === false`, label matches `/NOT writable/`, and `r.ok` is consistent with fatal-only failures.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — 56 tests (55 + this one), all green.

- [ ] **Step 6: Commit**

```bash
git add test/doctor.test.js
git commit -m "test(doctor): cover non-writable state/ advisory branch via accessSync mock

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Fix the "passed/total" summary (doctor.js)

**Files:**
- Modify: `src/commands/doctor.js:62-65`
- Test: `test/doctor.test.js` (add one test, after Task 2's test)

**Interfaces:**
- Consumes: `doctor({ env, log, sshConfigPath })` and the `fs.accessSync`-throws mock pattern from Task 2.
- Produces: the new summary string format `N/M required checks passed[ (K advisory warning[s])].` — consumed only by this task's test. The returned `{ ok, checks }` shape is **unchanged**.

**Problem:** today the headline counts `c.ok` across **all** checks, so a non-writable `state/` renders e.g. "8/9 checks passed" while `r.ok` is still `true` (because the verdict counts only fatal failures) — a visible contradiction.

- [ ] **Step 1: Write the failing summary-wording test**

Append to `test/doctor.test.js`:

```js
test('doctor summary counts required checks and surfaces advisories separately', (t) => {
  const cc = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-cc-'));
  const skillDir = path.join(cc, 'skills', 'h-ops');
  fs.mkdirSync(path.join(skillDir, 'state'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'x');
  const sshCfg = path.join(cc, 'ssh_config');
  fs.writeFileSync(sshCfg, '');

  t.mock.method(fs, 'accessSync', () => {
    throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
  });

  const logs = [];
  const r = doctor({ env: { CLAUDE_CONFIG_DIR: cc }, log: (s) => logs.push(s), sshConfigPath: sshCfg });

  const summary = logs.find((l) => /checks passed/.test(l));
  assert.ok(summary, 'a summary line is logged');
  assert.match(summary, /required checks passed/);
  // exactly one non-fatal failure exists (the non-writable state/), surfaced separately, singular
  assert.match(summary, /\(1 advisory warning\)/);

  const m = summary.match(/(\d+)\/(\d+) required checks passed/);
  assert.ok(m, 'summary headline is "N/M required checks passed"');
  const [, passedStr, totalStr] = m;
  // denominator is the count of REQUIRED (fatal) checks — the advisory is excluded
  assert.equal(Number(totalStr), r.checks.filter((c) => c.fatal).length);
  assert.equal(Number(passedStr), r.checks.filter((c) => c.fatal && c.ok).length);
  // verdict agrees with the displayed ratio (the contradiction is gone)
  assert.equal(r.ok, Number(passedStr) === Number(totalStr));
});
```

> Note: this asserts the **invariant** the spec's #3 describes ("headline reflects required checks; advisory surfaced separately; `ok` agrees with the headline") rather than a brittle literal `r.ok === true`. `r.ok` depends on machine-dependent tool checks (`ssh`/`column`/`rsync` presence), so a hard `true` would be flaky; `assert.equal(r.ok, passed === total)` proves the no-contradiction property deterministically.

- [ ] **Step 2: Run it and confirm it FAILS for the right reason**

Run: `node --test --test-name-pattern='counts required checks' test/doctor.test.js`
Expected: FAIL — the current summary is `N/M checks passed.` (no "required", no "(1 advisory warning)"), so `assert.match(summary, /required checks passed/)` fails.

- [ ] **Step 3: Rewrite the summary in `doctor.js`**

In `src/commands/doctor.js`, replace these four lines (62–65):

```js
  const failed = checks.filter((c) => c.fatal && !c.ok).length;
  const passed = checks.filter((c) => c.ok).length;
  log(`\n${passed}/${checks.length} checks passed.`);
  return { ok: failed === 0, checks };
```

with:

```js
  const requiredTotal = checks.filter((c) => c.fatal).length;
  const requiredPassed = checks.filter((c) => c.fatal && c.ok).length;
  const advisories = checks.filter((c) => !c.fatal && !c.ok).length;
  const advisoryNote = advisories
    ? ` (${advisories} advisory warning${advisories === 1 ? '' : 's'})`
    : '';
  log(`\n${requiredPassed}/${requiredTotal} required checks passed${advisoryNote}.`);
  return { ok: requiredPassed === requiredTotal, checks };
```

`requiredPassed === requiredTotal` is exactly equivalent to the old `failed === 0` (no fatal check failed), so `ok` is unchanged. `K` (advisories) is omitted entirely when there are no non-fatal failures, and "warning" is singular for `K === 1`.

- [ ] **Step 4: Run it and confirm it PASSES**

Run: `node --test --test-name-pattern='counts required checks' test/doctor.test.js`
Expected: PASS — summary now reads e.g. `12/14 required checks passed (1 advisory warning).`

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — 57 tests, all green. The existing doctor tests assert only `r.ok`/`r.checks` (not the summary string), so the wording change does not break them.

- [ ] **Step 6: Commit**

```bash
git add src/commands/doctor.js test/doctor.test.js
git commit -m "fix(doctor): summary counts required checks, advisories shown separately

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Strengthen grammar-sync test-2 (snapshot-docs.test.js)

**Files:**
- Modify: `test/snapshot-docs.test.js:24-32` (the second test)
- Reference (read-only): `references/operations.md` — the `accept --only` section and the fenced ` ```json ` State schema block

**Interfaces:**
- Consumes: `references/operations.md` content (the `accept --only` enumeration and the State JSON schema block).
- Produces: nothing other tasks rely on.

**Problem:** the four assertions `docs.includes('containers'/'network'/'access'/'system')` are vacuous — those words appear throughout `operations.md` regardless of correctness. Replace them with a real internal-consistency guard: the documented `accept --only` section set must exactly equal the State JSON schema's top-level keys (minus metadata `server`, `captured_at`).

- [ ] **Step 1: Replace the second test with the consistency guard**

In `test/snapshot-docs.test.js`, replace the entire second test (the one named `'operations.md documents accept --only sections and the exit-code convention'`, lines 24–32):

```js
test('operations.md documents accept --only sections and the exit-code convention', () => {
  const docs = fs.readFileSync(root + 'references/operations.md', 'utf8');
  for (const section of ['containers', 'network', 'access', 'system']) {
    assert.ok(docs.includes(section), `operations.md must mention the ${section} section`);
  }
  assert.match(docs, /DRIFT:2/);
  assert.match(docs, /DRIFT:1/);
  assert.match(docs, /DRIFT:0/);
});
```

with:

```js
test('operations.md documents accept --only sections and the exit-code convention', () => {
  const docs = fs.readFileSync(root + 'references/operations.md', 'utf8');

  // the accept command documents the --only <section> form
  assert.ok(docs.includes('--only <section>'),
    'operations.md must document the accept --only <section> form');

  // the documented --only section set, parsed from the `section` ∈ {...} enumeration
  const onlyMatch = docs.match(/`section`[^{]*\{([^}]+)\}/);
  assert.ok(onlyMatch, 'accept --only must enumerate its sections as `section` ∈ {...}');
  const onlySections = (onlyMatch[1].match(/`([^`]+)`/g) || []).map((t) => t.replace(/`/g, ''));

  // the State JSON schema block's top-level keys, minus metadata
  const jsonMatch = docs.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(jsonMatch, 'a fenced ```json State schema block must be present');
  const schemaSections = Object.keys(JSON.parse(jsonMatch[1]))
    .filter((k) => k !== 'server' && k !== 'captured_at');

  // the real invariant: documented --only sections === schema's top-level sections
  assert.deepEqual([...onlySections].sort(), [...schemaSections].sort());

  assert.match(docs, /DRIFT:2/);
  assert.match(docs, /DRIFT:1/);
  assert.match(docs, /DRIFT:0/);
});
```

Notes for the implementer:
- The `` `section`[^{]*\{([^}]+)\}` `` regex anchors on the backticked `` `section` `` token and grabs the next `{…}` group — tolerant of the `∈` glyph and surrounding whitespace, not brittle to reformatting.
- `JSON.parse(jsonMatch[1])` parses the example State JSON (it is valid JSON); its top-level keys are `server, captured_at, containers, network, access, system`, and filtering the two metadata keys leaves exactly the four `--only` sections.
- Keep the `DRIFT:{0,1,2}` assertions and the first test (markers) exactly as-is — they remain the primary guards.

- [ ] **Step 2: Run it and confirm it PASSES against the current (consistent) docs**

Run: `node --test test/snapshot-docs.test.js`
Expected: PASS — 2/2. Both sets are `['access', 'containers', 'network', 'system']` after sorting.

- [ ] **Step 3: Prove the guard bites — temporarily break the docs**

In `references/operations.md`, find the `accept --only` enumeration line (~line 78):

```
- With `--only <section>`, `section` ∈ {`containers`, `network`, `access`, `system`}: replace only
```

Temporarily remove one section token so it diverges from the schema (delete `` , `system` ``):

```
- With `--only <section>`, `section` ∈ {`containers`, `network`, `access`}: replace only
```

- [ ] **Step 4: Run it and confirm it FAILS (the guard catches divergence)**

Run: `node --test test/snapshot-docs.test.js`
Expected: FAIL — `assert.deepEqual` reports `['access','containers','network']` ≠ `['access','containers','network','system']`. This proves the new test guards the real invariant (unlike the old vacuous word-presence checks, which would still pass here because "system" appears elsewhere in the doc).

- [ ] **Step 5: Revert the temporary docs change**

Run: `git checkout -- references/operations.md`
Then re-run `node --test test/snapshot-docs.test.js` → Expected: PASS — 2/2 (docs are consistent again; `operations.md` is unmodified).

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — 57 tests, all green (Task 4 replaces a test in place; no count change).

- [ ] **Step 7: Commit**

```bash
git add test/snapshot-docs.test.js
git commit -m "test(snapshot-docs): guard accept --only sections against schema keys

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Final gate + ledger update

**Files:**
- Modify: `.superpowers/sdd/progress.md` (append a new section at end of file)

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: an updated ledger reflecting an empty deferred list.

- [ ] **Step 1: Re-verify the snapshot outer-script syntax**

Run: `bash -n scripts/snapshot.sh`
Expected: exit 0, no output.

- [ ] **Step 2: Run the full suite as the final gate**

Run: `npm test`
Expected: PASS — **≥ 57** tests, all green (55 baseline + Task 2 + Task 3; Task 4 replaced in place).

- [ ] **Step 3: Append the "deferred Minors RESOLVED" ledger entry**

Append to the end of `.superpowers/sdd/progress.md`:

```markdown

## Deferred Minors RESOLVED (branch fix/snapshot-drift-deferred-minors)
Plan: docs/superpowers/plans/2026-06-30-snapshot-drift-deferred-minors.md
Spec: docs/superpowers/specs/2026-06-30-snapshot-drift-deferred-minors-design.md

All four standing Minors from line 46 are now closed. Deferred list is EMPTY.
- T1(d) alias-shadows-builtin: scripts/snapshot.sh positional var renamed `alias` → `ssh_alias`
  (lines 9, 12 only; heredoc body untouched). Behavior invariant; bash -n clean.
- T3 not-writable branch untested: test/doctor.test.js now forces the `state/` not-writable branch
  via `t.mock.method(fs, 'accessSync', …)` (uid-independent — chmod 0o500 is root-bypassed) and
  locks `ok:false, fatal:false`, label /NOT writable/, advisory-does-not-flip-verdict.
- T3 misleading passed/total: src/commands/doctor.js summary now reads
  `N/M required checks passed (K advisory warning[s]).` — headline over fatal checks (agrees with
  `ok`); advisories surfaced separately; K omitted when zero; singular/plural handled.
  `return { ok, checks }` shape unchanged.
- T4 weak grammar-sync test-2: test/snapshot-docs.test.js test-2 now asserts the documented
  `accept --only` section set EQUALS the State JSON schema's top-level keys (minus server/captured_at),
  replacing the vacuous word-presence checks. Markers test + DRIFT:{0,1,2} regex kept as-is.
- Commit trailer: every commit on this branch carries
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

Full suite green (≥ 57). bash -n on snapshot.sh clean. No host-behavior change.
```

- [ ] **Step 4: Commit**

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs(sdd): record snapshot/drift deferred Minors resolved

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**

| Spec item | Task |
|-----------|------|
| #1 rename `alias` → `ssh_alias` (snapshot.sh:9,12) | Task 1 |
| #2 test "state/ exists but NOT writable" branch via `mock.method(fs,'accessSync')` | Task 2 |
| #3 fix "passed/total" summary → `N/M required checks passed (K advisory warning[s])` | Task 3 |
| #4 strengthen grammar-sync test-2 → `--only` set == schema top-level keys | Task 4 |
| #5 commit trailer on every commit | Global Constraints + every task's commit step |
| Non-goals (no host-behavior change, shape unchanged, no history rewrite) | Global Constraints |
| Implementation order & verification (bash -n, npm test, final ≥57 gate) | Tasks 1–5 + Task 5 final gate |
| Ledger update (deferred Minors RESOLVED) | Task 5 |

No gaps.

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N"/bare-prose code steps. Every code step shows the actual code; every run step shows the exact command and expected result.

**3. Type/name consistency:** The summary fields `requiredTotal`/`requiredPassed`/`advisories`/`advisoryNote` are defined and used only within Task 3's replacement block. The summary regex in Task 3's test (`/(\d+)\/(\d+) required checks passed/` and `/\(1 advisory warning\)/`) matches the exact string Task 3 produces (`N/M required checks passed (1 advisory warning).`). The `fs.accessSync`-throws mock is identical in Tasks 2 and 3. Task 4's `onlySections`/`schemaSections` both resolve to `['access','containers','network','system']` after sorting, so `assert.deepEqual` holds against the current docs. `doctor`'s return shape stays `{ ok, checks }` with `ok = requiredPassed === requiredTotal` (equivalent to the prior `failed === 0`).

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-30-snapshot-drift-deferred-minors.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
