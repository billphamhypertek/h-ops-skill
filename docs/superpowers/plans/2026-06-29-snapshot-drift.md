# h-ops snapshot + drift (tripwire change-detection) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `snapshot` / `drift` / `accept` sub-commands so the operator can answer "did something change on a server that I didn't do?" — capturing a structured per-server state fingerprint, blessing a baseline, and on demand semantically comparing live state vs that baseline with severity-classified results (tripwire model).

**Architecture:** One new read-only bash script, `scripts/snapshot.sh`, emits a canonical, sorted, TAB-delimited text dump of four surfaces (containers, network/firewall, access, system) over SSH. The three sub-commands are **Claude-orchestrated** (no new JS/runtime code): `snapshot` runs the script and serializes the dump into the documented JSON schema written to `state/<name>.current.json`; `drift` does that plus a semantic JSON comparison vs `state/<name>.baseline.json` with a severity rubric; `accept` is a confirm-then-copy/merge of current→baseline. State lives in a gitignored `state/` dir keyed by inventory server name. The installer ships `snapshot.sh` as a framework file (already inside the `scripts/` whitelist entry), preserves `state/` across `update`, and `doctor` gains a non-fatal `state/` writability check.

**Tech Stack:** Bash + ssh (the skill runtime, same `SSH_OPTS`/graceful-degradation style as `audit.sh`/`health.sh`); Node ≥18 ESM installer with `node:test` + `node:assert/strict` (zero test deps); documentation in `SKILL.md` + `references/operations.md` that Claude follows at runtime.

## Global Constraints

These apply to **every** task. Exact values are copied from the spec.

- **No new runtime dependency.** No `jq`/`yq` required on host or locally. `jq`, if present on a host, may be used opportunistically by `snapshot.sh` but must **not** be required.
- **No secret capture.** Never private keys, never passwords. `authorized_keys` is reduced to **SHA256 fingerprints (+ key comment)**, never the key body. `sshd_config` is reduced to **named policy fields** (`PasswordAuthentication`, `PermitRootLogin`, `PubkeyAuthentication`), never the whole file.
- **State files are sensitive-operational.** `state/` is gitignored; in chat show only **diffs/summaries**, never dump a whole state file.
- **State is keyed by inventory server NAME** (the `servers:` key), not the ssh alias. Scripts receive **aliases only** and never read YAML.
- **`snapshot` and `drift` are read-only on hosts** → run without confirmation, like `overview`/`audit`. **`accept` always shows the exact diff and confirms before writing** — never auto-accept.
- **First-run establishes the baseline explicitly.** A `snapshot`/`drift` with no baseline writes `state/<name>.baseline.json` from current state and says so — never a silent "all clear".
- **Determinism:** arrays sorted lexically; object keys in the fixed schema order; values normalized (trimmed, whitespace collapsed). `captured_at` is metadata — **ignored when diffing**.
- **No history.** Tripwire model keeps only `baseline` + `current` per server. No timestamped snapshots.
- **npm `files` whitelist is unchanged** — `scripts/` already covers `snapshot.sh`; `state/` is deliberately excluded so it is never published.
- Work on branch `feat/snapshot-drift` (already checked out). Commit after each task with conventional-commit messages. Run `node --test` (full suite) before each commit.
- The four canonical section markers / their `[MARKER]` spelling MUST be identical across `scripts/snapshot.sh`, `references/operations.md`, and `test/snapshot-docs.test.js`. The full marker list is: `[META]`, `[CONTAINERS]`, `[NETWORK.LISTENING]`, `[NETWORK.FIREWALL]`, `[ACCESS.SHELL_USERS]`, `[ACCESS.SUDO]`, `[ACCESS.AUTHORIZED_KEYS]`, `[ACCESS.SSHD]`, `[SYSTEM.KERNEL]`, `[SYSTEM.PACKAGES_SECURITY]`, `[SYSTEM.PACKAGES_ALL_HASH]`, `[SYSTEM.CRON]`, `[SYSTEM.TIMERS]`, `[SYSTEM.CONFIG_CHECKSUMS]`, `[END]`.

## File Structure

- **Create** `scripts/snapshot.sh` — the single new script. One ssh alias + optional extra config paths → canonical text dump. Read-only, degrades gracefully without root.
- **Create** `test/snapshot-script.test.js` — guards the script contract testable on macOS (arg guard, outer + remote-block syntax, marker presence).
- **Create** `test/snapshot-docs.test.js` — grammar-sync: every `[MARKER]` appears in both `scripts/snapshot.sh` and `references/operations.md`.
- **Modify** `src/lib/manifest.js` — add `scripts/snapshot.sh` (exec) to `SKILL_FILES`.
- **Modify** `test/manifest.test.js` — assert snapshot.sh is a framework file + executable.
- **Modify** `.gitignore` — ignore `state/`.
- **Modify** `test/update.test.js` — assert `update` preserves `state/`.
- **Modify** `src/commands/doctor.js` — add a non-fatal `state/` writability check (and a `fatal` flag on checks).
- **Modify** `test/doctor.test.js` — assert the `state/` check is non-fatal and detects a writable dir.
- **Modify** `references/operations.md` — how-to for `snapshot`/`drift`/`accept`, JSON schema, determinism rules, the `snapshot.sh` grammar→JSON mapping, extra-config convention, severity rubric + exit-code convention.
- **Modify** `SKILL.md` — router rows, an `accept`-confirm safety rule, a short tripwire paragraph, frontmatter examples.
- **Modify** `commands/h-ops.md` — list the three new sub-commands.
- **Modify** `README.md` — sub-command rows + a change-detection / `state/` note.
- **Modify** `servers/_example.md` — document the optional extra-config-checksums section.

---

### Task 1: `scripts/snapshot.sh` — canonical state dump

**Files:**
- Create: `scripts/snapshot.sh`
- Test: `test/snapshot-script.test.js`

**Interfaces:**
- Consumes: nothing (standalone bash, like `audit.sh`).
- Produces: CLI `snapshot.sh <ssh_alias> [extra_config_path ...]`. Exits 2 on no args; prints `UNREACHABLE: <alias>` to stderr + exits 1 on connection failure; otherwise prints the dump (markers from `[META]` to `[END]`, TAB-delimited fields, each list section sorted, or a sentinel `(none)` / `(unavailable)` / `(unavailable: needs root)`). Read-only on the host.

- [ ] **Step 1: Write the failing test** — `test/snapshot-script.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const SNAP = fileURLToPath(new URL('../scripts/snapshot.sh', import.meta.url));

const MARKERS = [
  '[META]', '[CONTAINERS]', '[NETWORK.LISTENING]', '[NETWORK.FIREWALL]',
  '[ACCESS.SHELL_USERS]', '[ACCESS.SUDO]', '[ACCESS.AUTHORIZED_KEYS]', '[ACCESS.SSHD]',
  '[SYSTEM.KERNEL]', '[SYSTEM.PACKAGES_SECURITY]', '[SYSTEM.PACKAGES_ALL_HASH]',
  '[SYSTEM.CRON]', '[SYSTEM.TIMERS]', '[SYSTEM.CONFIG_CHECKSUMS]', '[END]',
];

test('snapshot.sh exits 2 with usage when given no args', () => {
  const r = spawnSync('bash', [SNAP], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage:/);
});

test('snapshot.sh passes bash -n (outer script syntax)', () => {
  const r = spawnSync('bash', ['-n', SNAP], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('the remote heredoc block is valid bash', () => {
  const src = fs.readFileSync(SNAP, 'utf8');
  const m = src.match(/<<'EOF'[^\n]*\n([\s\S]*?)\nEOF/);
  assert.ok(m, 'a quoted EOF heredoc is present');
  const r = spawnSync('bash', ['-n'], { input: m[1], encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('snapshot.sh emits every documented section marker', () => {
  const src = fs.readFileSync(SNAP, 'utf8');
  for (const marker of MARKERS) {
    assert.ok(src.includes(marker), `script must emit ${marker}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/snapshot-script.test.js`
Expected: FAIL (`scripts/snapshot.sh` does not exist → spawn `status` not 2 / `readFileSync` throws).

- [ ] **Step 3: Create `scripts/snapshot.sh`**

```bash
#!/usr/bin/env bash
# h-ops snapshot — capture a server's security-relevant state as a canonical, sorted text dump.
# Usage: snapshot.sh <ssh_alias> [extra_config_path ...]
# Read-only on the host. Extra config paths (absolute) are checksummed in addition to the default
# set; the caller (Claude) passes any declared in servers/<name>.md. Degrades gracefully without root.
# Output grammar is documented in references/operations.md (Claude parses it into the state JSON).
set -uo pipefail
[ $# -lt 1 ] && { echo "usage: $0 <ssh_alias> [extra_config_path ...]" >&2; exit 2; }
alias="$1"; shift
SSH_OPTS=(-o ConnectTimeout=8 -o BatchMode=yes -o StrictHostKeyChecking=accept-new)

ssh "${SSH_OPTS[@]}" "$alias" bash -s -- "$@" <<'EOF' || { echo "UNREACHABLE: $alias" >&2; exit 1; }
export LC_ALL=C
if [ "$(id -u 2>/dev/null)" = "0" ]; then IS_ROOT=1; else IS_ROOT=0; fi

# Read stdin; print it, or a sentinel when empty. needs_root=1 → empty-without-root is "unavailable".
emit_list() {
  local needs_root="${1:-0}" out; out="$(cat)"
  if [ -n "$out" ]; then printf '%s\n' "$out"
  elif [ "$needs_root" = "1" ] && [ "$IS_ROOT" != "1" ]; then echo "(unavailable: needs root)"
  else echo "(none)"; fi
}

echo "[META]"
printf 'captured_at\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo '?')"
printf 'hostname\t%s\n' "$(hostname 2>/dev/null || echo '?')"

echo "[CONTAINERS]"
if command -v docker >/dev/null 2>&1; then
  for c in $(docker ps -q 2>/dev/null); do
    name=$(docker inspect -f '{{.Name}}' "$c" 2>/dev/null | sed 's#^/##')
    image=$(docker inspect -f '{{.Config.Image}}' "$c" 2>/dev/null)
    restart=$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$c" 2>/dev/null)
    ports=$(docker inspect -f '{{range $p, $b := .HostConfig.PortBindings}}{{range $b}}{{.HostIp}}:{{.HostPort}}->{{$p}} {{end}}{{end}}' "$c" 2>/dev/null \
            | tr ' ' '\n' | grep -v '^$' | sort -u | paste -sd, -)
    printf '%s\t%s\t%s\t%s\n' "$name" "$image" "${restart:-no}" "$ports"
  done | sort | emit_list 0
else echo "(unavailable)"; fi

echo "[NETWORK.LISTENING]"
if command -v ss >/dev/null 2>&1 || command -v netstat >/dev/null 2>&1; then
  ( ss -tlnH 2>/dev/null | awk '{print $4}' || netstat -tln 2>/dev/null | awk 'NR>2{print $4}' ) \
    | sort -u | emit_list 0
else echo "(unavailable)"; fi

echo "[NETWORK.FIREWALL]"
if command -v ufw >/dev/null 2>&1 && ufw status >/dev/null 2>&1; then
  printf 'backend\tufw\n'; ufw status 2>/dev/null | awk 'NR>1 && NF' | sort
elif command -v nft >/dev/null 2>&1 && nft list ruleset >/dev/null 2>&1; then
  printf 'backend\tnft\n'; nft list ruleset 2>/dev/null | sed 's/[[:space:]]\{1,\}/ /g;s/^ //;s/ $//' | grep -vE '^$' | sort
elif command -v iptables >/dev/null 2>&1 && iptables -S >/dev/null 2>&1; then
  printf 'backend\tiptables\n'; iptables -S 2>/dev/null | sort
elif { command -v ufw || command -v nft || command -v iptables; } >/dev/null 2>&1; then
  printf 'backend\tunknown\n'; echo "(unavailable: needs root)"
else
  printf 'backend\tnone\n'
fi

echo "[ACCESS.SHELL_USERS]"
getent passwd 2>/dev/null | awk -F: '$7 ~ /\/(sh|bash|zsh|fish|ash|dash)$/ {print $1}' | sort -u | emit_list 0

echo "[ACCESS.SUDO]"
{ getent group sudo 2>/dev/null | cut -d: -f4 | tr ',' '\n'
  getent group wheel 2>/dev/null | cut -d: -f4 | tr ',' '\n'; } | grep -v '^$' | sort -u | emit_list 0

echo "[ACCESS.AUTHORIZED_KEYS]"
getent passwd 2>/dev/null | awk -F: '$7 ~ /\/(sh|bash|zsh|fish|ash|dash)$/ {print $1":"$6}' | while IFS=: read -r u home; do
  ak="$home/.ssh/authorized_keys"
  [ -r "$ak" ] || continue
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|\#*) continue ;; esac
    fp=$(printf '%s\n' "$line" | ssh-keygen -lf - 2>/dev/null | awk '{print $2" ("$NF")"}')
    [ -n "$fp" ] && printf '%s\t%s\n' "$u" "$fp"
  done < "$ak"
done | sort -u | emit_list 1

echo "[ACCESS.SSHD]"
for k in passwordauthentication permitrootlogin pubkeyauthentication; do
  v=$(sshd -T 2>/dev/null | awk -v k="$k" 'tolower($1)==k{print $2; exit}')
  [ -z "$v" ] && v=$(grep -iE "^[[:space:]]*${k}[[:space:]]" /etc/ssh/sshd_config 2>/dev/null | awk '{print $2; exit}')
  printf '%s\t%s\n' "$k" "${v:-?}"
done

echo "[SYSTEM.KERNEL]"
uname -r 2>/dev/null || echo "(unavailable)"

echo "[SYSTEM.PACKAGES_SECURITY]"
SECPKGS="openssl openssh-server sudo libssl3 libpam-modules systemd libc6 curl"
if command -v dpkg-query >/dev/null 2>&1; then
  for p in $SECPKGS; do
    v=$(dpkg-query -W -f='${Version}' "$p" 2>/dev/null) && [ -n "$v" ] && printf '%s\t%s\n' "$p" "$v"
  done | sort | emit_list 0
elif command -v rpm >/dev/null 2>&1; then
  for p in $SECPKGS; do
    v=$(rpm -q --qf '%{VERSION}-%{RELEASE}\n' "$p" 2>/dev/null) && [ -n "$v" ] && printf '%s\t%s\n' "$p" "$v"
  done | sort | emit_list 0
else echo "(unavailable)"; fi

echo "[SYSTEM.PACKAGES_ALL_HASH]"
if command -v dpkg-query >/dev/null 2>&1 && command -v sha256sum >/dev/null 2>&1; then
  h=$(dpkg-query -W -f='${Package} ${Version}\n' 2>/dev/null | sort | sha256sum | awk '{print $1}')
  if [ -n "$h" ]; then printf 'sha256:%s\n' "$h"; else echo "(unavailable)"; fi
elif command -v rpm >/dev/null 2>&1 && command -v sha256sum >/dev/null 2>&1; then
  h=$(rpm -qa 2>/dev/null | sort | sha256sum | awk '{print $1}')
  if [ -n "$h" ]; then printf 'sha256:%s\n' "$h"; else echo "(unavailable)"; fi
else echo "(unavailable)"; fi

echo "[SYSTEM.CRON]"
{
  for f in /etc/crontab /etc/cron.d/*; do [ -r "$f" ] && sed 's/[[:space:]]\{1,\}/ /g' "$f"; done
  for u in $(getent passwd 2>/dev/null | cut -d: -f1); do crontab -l -u "$u" 2>/dev/null; done
} 2>/dev/null | grep -vE '^[[:space:]]*#' | grep -vE '^[[:space:]]*$' | sort -u | emit_list 1

echo "[SYSTEM.TIMERS]"
if command -v systemctl >/dev/null 2>&1; then
  systemctl list-unit-files --type=timer --no-legend --no-pager 2>/dev/null | awk 'NF{print $1" "$2}' | sort -u | emit_list 0
else echo "(unavailable)"; fi

echo "[SYSTEM.CONFIG_CHECKSUMS]"
if command -v sha256sum >/dev/null 2>&1; then
  for f in /etc/ssh/sshd_config /etc/sudoers /etc/nginx/nginx.conf /etc/caddy/Caddyfile "$@"; do
    [ -r "$f" ] || continue
    h=$(sha256sum "$f" 2>/dev/null | awk '{print $1}')
    [ -n "$h" ] && printf '%s\tsha256:%s\n' "$f" "$h"
  done | sort -u | emit_list 1
else echo "(unavailable)"; fi

echo "[END]"
EOF
```

- [ ] **Step 4: Make it executable**

Run: `chmod +x scripts/snapshot.sh`
Expected: no output; `scripts/snapshot.sh` now has the owner-exec bit (matching the other scripts).

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/snapshot-script.test.js`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full suite (no regressions)**

Run: `node --test`
Expected: PASS (existing suite + the new file).

- [ ] **Step 7: Commit**

```bash
git add scripts/snapshot.sh test/snapshot-script.test.js
git commit -m "feat(snapshot): add snapshot.sh canonical state-dump script"
```

---

### Task 2: Ship `snapshot.sh` + gitignore `state/` + preserve it across update

**Files:**
- Modify: `src/lib/manifest.js` (add to `SKILL_FILES`)
- Modify: `test/manifest.test.js` (assert it)
- Modify: `.gitignore` (ignore `state/`)
- Modify: `test/update.test.js` (assert `update` preserves `state/`)

**Interfaces:**
- Consumes: `SKILL_FILES` shape `{ path: string, exec?: boolean }` (existing); `update({env, log})` (existing, unchanged).
- Produces: `scripts/snapshot.sh` copied by `copyFramework`/`update`/`init` as an executable framework file; `state/` ignored by git and untouched by `update`.

- [ ] **Step 1: Write the failing manifest test** — append to `test/manifest.test.js`

```js
test('SKILL_FILES ships snapshot.sh as an executable framework file', () => {
  const snap = SKILL_FILES.find((f) => f.path === 'scripts/snapshot.sh');
  assert.ok(snap, 'snapshot.sh must be a framework file');
  assert.equal(snap.exec, true);
});
```

- [ ] **Step 2: Write the failing update test** — append to `test/update.test.js`

```js
test('update preserves the state/ directory (drift baselines)', () => {
  const cc = tmpClaude();
  const skillDir = path.join(cc, 'skills', 'h-ops');
  fs.mkdirSync(path.join(skillDir, 'state'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'OLD');
  fs.writeFileSync(path.join(skillDir, 'state', 'web.baseline.json'), '{"server":"web"}');

  update({ env: { CLAUDE_CONFIG_DIR: cc }, log: () => {} });

  assert.equal(fs.readFileSync(path.join(skillDir, 'state', 'web.baseline.json'), 'utf8'), '{"server":"web"}');
  assert.notEqual(fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8'), 'OLD');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test test/manifest.test.js test/update.test.js`
Expected: FAIL — manifest: `snap` is `undefined`; update: `copyFramework` throws because `scripts/snapshot.sh` is referenced via `SKILL_FILES` only after Step 4 (the update-preserve test currently passes on the preserve assertion but the manifest assert fails). Confirm at least the new manifest test fails.

- [ ] **Step 4: Add snapshot.sh to the manifest** — `src/lib/manifest.js`

Add the entry to `SKILL_FILES` (keep it next to the other scripts):

```js
export const SKILL_FILES = [
  { path: 'SKILL.md' },
  { path: 'scripts/overview.sh', exec: true },
  { path: 'scripts/run.sh', exec: true },
  { path: 'scripts/health.sh', exec: true },
  { path: 'scripts/audit.sh', exec: true },
  { path: 'scripts/snapshot.sh', exec: true },
  { path: 'references/operations.md' },
  { path: 'references/deploy-playbooks.example.md' },
  { path: 'inventory.example.yml' },
  { path: 'servers/_example.md' },
  { path: 'README.md' },
  { path: 'LICENSE' },
];
```

- [ ] **Step 5: Ignore `state/`** — `.gitignore`

Add `state/` under the "Real fleet data" section so the directory is never committed:

```gitignore
# --- Real fleet data: NEVER publish (this repo is public) ---
inventory.yml
secrets.local.yml
secrets.local.yaml
servers/*.md
!servers/_example.md
references/deploy-playbooks.md
state/
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test test/manifest.test.js test/update.test.js`
Expected: PASS — manifest finds `snapshot.sh` (exec true); update copies framework (incl. `snapshot.sh` from the repo root created in Task 1) while `state/web.baseline.json` survives.

- [ ] **Step 7: Run the full suite**

Run: `node --test`
Expected: PASS (the `SKILL_FILES never overlaps user-data files` invariant still holds — `snapshot.sh` is framework, `state/` is not in `USER_DATA_FILES`).

- [ ] **Step 8: Commit**

```bash
git add src/lib/manifest.js test/manifest.test.js .gitignore test/update.test.js
git commit -m "feat(snapshot): ship snapshot.sh; gitignore + preserve state/"
```

---

### Task 3: `doctor` — non-fatal `state/` writability check

**Files:**
- Modify: `src/commands/doctor.js`
- Test: `test/doctor.test.js`

**Interfaces:**
- Consumes: `getPaths` (existing).
- Produces: `doctor()` still returns `{ ok, checks }`, but each check now carries `{ ok, label, fatal }`. `fatal` defaults to `true`; `r.ok` is computed from **fatal** failures only. A `state/` check is pushed with `fatal: false` so it never flips `r.ok`.

- [ ] **Step 1: Write the failing tests** — append to `test/doctor.test.js`

```js
test('doctor reports state/ as a non-fatal check', () => {
  const cc = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-cc-'));
  const skillDir = path.join(cc, 'skills', 'h-ops');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'x');
  const sshCfg = path.join(cc, 'ssh_config');
  fs.writeFileSync(sshCfg, '');

  const r = doctor({ env: { CLAUDE_CONFIG_DIR: cc }, log: () => {}, sshConfigPath: sshCfg });
  const stateCheck = r.checks.find((c) => /state\//.test(c.label));
  assert.ok(stateCheck, 'a state/ check is present');
  assert.equal(stateCheck.fatal, false);
});

test('doctor sees an existing writable state/ dir', () => {
  const cc = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-cc-'));
  const skillDir = path.join(cc, 'skills', 'h-ops');
  fs.mkdirSync(path.join(skillDir, 'state'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'x');
  const sshCfg = path.join(cc, 'ssh_config');
  fs.writeFileSync(sshCfg, '');

  const r = doctor({ env: { CLAUDE_CONFIG_DIR: cc }, log: () => {}, sshConfigPath: sshCfg });
  const stateCheck = r.checks.find((c) => /state\//.test(c.label));
  assert.equal(stateCheck.ok, true);
  assert.match(stateCheck.label, /writable/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/doctor.test.js`
Expected: FAIL (no check label matches `/state\//`; `stateCheck` is `undefined`).

- [ ] **Step 3: Add the `fatal` flag and `state/` check** — `src/commands/doctor.js`

Replace the `add` helper so checks carry a `fatal` flag (default `true`) and non-fatal failures print a `•` glyph:

```js
  const checks = [];
  const add = (ok, label, { fatal = true } = {}) => {
    checks.push({ ok, label, fatal });
    log(`${ok ? '✓' : fatal ? '✗' : '•'} ${label}`);
  };
```

Then, immediately before the `const failed = ...` summary line, add the `state/` check:

```js
  const stateDir = path.join(skillDir, 'state');
  if (fs.existsSync(stateDir)) {
    let writable = true;
    try { fs.accessSync(stateDir, fs.constants.W_OK); } catch { writable = false; }
    add(writable,
      writable ? `state/ writable (${stateDir})` : `state/ exists but is NOT writable (${stateDir})`,
      { fatal: false });
  } else {
    add(true, 'state/ not created yet — created on first snapshot', { fatal: false });
  }
```

Finally, change the summary to count only fatal failures (so a non-writable `state/` never flips `ok`):

```js
  const failed = checks.filter((c) => c.fatal && !c.ok).length;
  const passed = checks.filter((c) => c.ok).length;
  log(`\n${passed}/${checks.length} checks passed.`);
  return { ok: failed === 0, checks };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/doctor.test.js`
Expected: PASS (the existing "missing ssh alias" test still reports `r.ok === false` — alias checks remain `fatal: true`).

- [ ] **Step 5: Run the full suite**

Run: `node --test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/commands/doctor.js test/doctor.test.js
git commit -m "feat(snapshot): doctor non-fatal state/ writability check"
```

---

### Task 4: `references/operations.md` — how-to, schema, grammar, rubric

**Files:**
- Modify: `references/operations.md`
- Test: `test/snapshot-docs.test.js`

**Interfaces:**
- Consumes: the `snapshot.sh` grammar from Task 1 (the `[MARKER]` set).
- Produces: operator/Claude-facing documentation. The grammar-sync test guards that every `[MARKER]` is documented here AND emitted by the script.

- [ ] **Step 1: Write the failing grammar-sync test** — `test/snapshot-docs.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

const MARKERS = [
  '[META]', '[CONTAINERS]', '[NETWORK.LISTENING]', '[NETWORK.FIREWALL]',
  '[ACCESS.SHELL_USERS]', '[ACCESS.SUDO]', '[ACCESS.AUTHORIZED_KEYS]', '[ACCESS.SSHD]',
  '[SYSTEM.KERNEL]', '[SYSTEM.PACKAGES_SECURITY]', '[SYSTEM.PACKAGES_ALL_HASH]',
  '[SYSTEM.CRON]', '[SYSTEM.TIMERS]', '[SYSTEM.CONFIG_CHECKSUMS]', '[END]',
];

test('every snapshot grammar marker is both emitted and documented', () => {
  const script = fs.readFileSync(root + 'scripts/snapshot.sh', 'utf8');
  const docs = fs.readFileSync(root + 'references/operations.md', 'utf8');
  for (const m of MARKERS) {
    assert.ok(script.includes(m), `snapshot.sh must emit ${m}`);
    assert.ok(docs.includes(m), `operations.md must document ${m}`);
  }
});

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

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/snapshot-docs.test.js`
Expected: FAIL (operations.md has none of the markers / `DRIFT:n` tokens yet).

- [ ] **Step 3: Append the documentation** — add to the end of `references/operations.md`

````markdown
## snapshot <srv|group|all>

Capture state for each target and write `state/<name>.current.json`, keyed by the inventory
**server name** (the `servers:` key), not the ssh alias.

1. Resolve the target to `{name, alias}` pairs from `../inventory.yml`.
2. Ensure the state dir exists: `mkdir -p state`.
3. For each pair, collect any extra config-checksum paths from `../servers/<name>.md` (see
   "Extra config checksums" below) and run:
   `scripts/snapshot.sh <alias> [extra_path ...]`.
4. Parse the text dump (grammar below) into the canonical JSON schema, apply the determinism rules,
   and write `state/<name>.current.json`.
5. If `state/<name>.baseline.json` does **not** exist, also write it (first capture establishes the
   baseline) and tell the operator explicitly — never a silent "all clear".

Read-only on hosts; run without confirmation.

## drift <srv|group|all>

1. Do everything `snapshot` does (capture current; first-run establishes the baseline and says so).
2. For each server that has a baseline, **semantically compare** the parsed `current` JSON vs the
   parsed `baseline` JSON (compare values, ignoring `captured_at`). Classify each change with the
   rubric below. A section whose current value is `(unavailable)` / `(unavailable: needs root)` was
   *not captured* — carry the baseline value forward and do NOT report it as drift. `(none)` means
   captured-and-empty (`[]` / `{}`) and IS comparable.
3. Print a per-server report, grouped and sorted by severity (🔴 → 🟡 → 🟢), with a one-line
   recommendation per change. End with the hint:
   `run /h-ops accept <srv>` (or `accept <srv> --only <section>`) to bless reviewed changes.
4. For `drift all` / a group, print a one-line summary per server first, then the detail.
5. Communicate a status token per the exit-code convention below (the seam for a future
   `schedule`/alert layer). Does NOT modify any baseline. Read-only on hosts.

**Exit-code / status convention** (overall = max across servers in a multi-target run):
- `DRIFT:2` — at least one 🔴 CONCERNING change present (a future wrapper would exit 2).
- `DRIFT:1` — only 🟡 NOTABLE / 🟢 BENIGN changes present (exit 1).
- `DRIFT:0` — no changes; clean (exit 0).

## accept <srv> [--only <section>]

Fold reviewed `current` state into the `baseline` (tripwire). **Always show the exact diff being
accepted and confirm before writing — never auto-accept.**

- Without `--only`: replace the whole `state/<srv>.baseline.json` with `state/<srv>.current.json`.
- With `--only <section>`, `section` ∈ {`containers`, `network`, `access`, `system`}: replace only
  that top-level key in the baseline with the value from current; leave the other sections of the
  baseline unchanged. Refresh the baseline's `captured_at` to current's.

Writes a local file only (no host mutation), but it is a meaningful security action → confirm first.
State files are sensitive-operational: show only the diff/summary in chat, never dump a whole file.

## State JSON schema (canonical)

```json
{
  "server": "web-prod",
  "captured_at": "2026-06-29T10:00:00Z",
  "containers": [
    {"name": "caddy", "image": "caddy:2.7", "restart": "always", "ports": ["80", "443"]}
  ],
  "network": {
    "listening": ["0.0.0.0:443", "127.0.0.1:5432"],
    "firewall": {"backend": "ufw", "rules": ["22/tcp ALLOW", "80/tcp ALLOW"]}
  },
  "access": {
    "shell_users": ["ubuntu"],
    "sudo": ["ubuntu"],
    "authorized_keys": {"ubuntu": ["SHA256:abc123 (laptop)"]},
    "sshd": {"PasswordAuthentication": "no", "PermitRootLogin": "no"}
  },
  "system": {
    "kernel": "6.8.0-31",
    "packages_security": [{"name": "openssl", "version": "3.0.2-0ubuntu1.15"}],
    "packages_all_hash": "sha256:...",
    "cron": ["..."],
    "timers": ["..."],
    "config_checksums": {"/etc/nginx/nginx.conf": "sha256:..."}
  }
}
```

**Determinism rules** (unchanged state → stable JSON, clean diffs):
- Arrays sorted lexically; object keys in the fixed order shown above; values normalized (trimmed,
  whitespace collapsed). The diff is semantic, so minor formatting never produces a false positive;
  these rules keep `accept`'d baseline files clean and reviewable.
- `captured_at` (from the remote `date -u`) is **metadata: ignored when diffing.**
- `server` is filled from the inventory name (the script does not know it).

## snapshot.sh output grammar → JSON mapping

`scripts/snapshot.sh` prints sections delimited by `[MARKER]` lines; fields within a line are
TAB-separated; list sections are pre-sorted. A section body of `(none)` is an empty list/object;
`(unavailable)` / `(unavailable: needs root)` means not-captured (carry baseline forward).

| Marker | JSON target |
|--------|-------------|
| `[META]` | `captured_at` (ignored in diff); `hostname` informational |
| `[CONTAINERS]` | `containers[]` = `{name, image, restart, ports[]}` (ports split on `,`) |
| `[NETWORK.LISTENING]` | `network.listening[]` |
| `[NETWORK.FIREWALL]` | `network.firewall` = `{backend, rules[]}` (line `backend\t<x>`, then rule lines) |
| `[ACCESS.SHELL_USERS]` | `access.shell_users[]` |
| `[ACCESS.SUDO]` | `access.sudo[]` |
| `[ACCESS.AUTHORIZED_KEYS]` | `access.authorized_keys` = `{<user>: ["SHA256:… (comment)", …]}` |
| `[ACCESS.SSHD]` | `access.sshd` = `{<Field>: <value>}` |
| `[SYSTEM.KERNEL]` | `system.kernel` |
| `[SYSTEM.PACKAGES_SECURITY]` | `system.packages_security[]` = `{name, version}` |
| `[SYSTEM.PACKAGES_ALL_HASH]` | `system.packages_all_hash` |
| `[SYSTEM.CRON]` | `system.cron[]` |
| `[SYSTEM.TIMERS]` | `system.timers[]` |
| `[SYSTEM.CONFIG_CHECKSUMS]` | `system.config_checksums` = `{<path>: "sha256:…"}` |
| `[END]` | end of dump |

## Extra config checksums (per-server)

`../servers/<name>.md` may declare extra files to checksum, in addition to the built-in default set
(reverse-proxy config, `sshd_config`, `/etc/sudoers`):

```
## Snapshot — extra config checksums (optional)
- /etc/fail2ban/jail.local
- /etc/myapp/app.conf
```

When running `snapshot`/`drift`, collect every absolute path (a list item whose first token starts
with `/`) under that heading and pass them as extra args: `scripts/snapshot.sh <alias> <path>…`.

## Drift classification rubric (Claude judges each change)

- 🔴 **CONCERNING** — new sudo member; new `authorized_keys` fingerprint; new listening port on a
  public (`0.0.0.0`/non-loopback) address; firewall rule removed or loosened;
  `PasswordAuthentication`/`PermitRootLogin` re-enabled; checksum change on a security-sensitive
  config file (`sshd_config`, `/etc/sudoers`); new cron job / systemd timer.
- 🟡 **NOTABLE** — container image tag bump (often an expected deploy); a new container that may be
  intentional; non-security package version change.
- 🟢 **BENIGN** — security package auto-updates (unattended-upgrades); ephemeral listening-port churn.
````

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/snapshot-docs.test.js`
Expected: PASS (both tests).

- [ ] **Step 5: Run the full suite**

Run: `node --test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add references/operations.md test/snapshot-docs.test.js
git commit -m "docs(snapshot): operations how-to, JSON schema, grammar, rubric"
```

---

### Task 5: Router + safety + discoverability (SKILL.md, command, README, example)

**Files:**
- Modify: `SKILL.md` (router rows, safety rule, tripwire paragraph, frontmatter examples)
- Modify: `commands/h-ops.md` (list new sub-commands)
- Modify: `README.md` (sub-command rows + change-detection note)
- Modify: `servers/_example.md` (extra-config-checksums section)

**Interfaces:**
- Consumes: the operations.md how-to from Task 4 (referenced, not duplicated).
- Produces: the three sub-commands are routable and discoverable; `accept` safety is stated; the per-server extra-config convention is templated.

- [ ] **Step 1: Add the router rows** — `SKILL.md`

Insert these three rows in the sub-command table, immediately after the `deploy` row and before the `(none / unknown)` row:

```markdown
| `snapshot <srv\|group\|all>` | `scripts/snapshot.sh <alias>` per target; serialize the dump to `state/<name>.current.json`. First capture also writes `state/<name>.baseline.json` (the blessed baseline) and says so. Read-only. |
| `drift <srv\|group\|all>` | Capture current, **semantically compare** vs the baseline, classify changes 🔴/🟡/🟢, print a grouped report. Never changes the baseline. |
| `accept <srv> [--only <section>]` | Fold reviewed current state into the baseline (tripwire). **Show the diff and confirm before writing.** `--only containers\|network\|access\|system` merges one section. |
```

- [ ] **Step 2: Add the `accept` safety rule** — `SKILL.md`

Append a new rule to the "Safety rules (NON-NEGOTIABLE)" list:

```markdown
6. **`accept` confirms before writing; never dump state files.** `snapshot`/`drift` are read-only on
   hosts (run freely). `accept` rewrites a local baseline (a security action) — always show the exact
   diff and confirm; never auto-accept. State under `state/` is sensitive-operational: show only
   diffs/summaries, never paste a whole state file into chat.
```

- [ ] **Step 3: Add the tripwire paragraph** — `SKILL.md`

Insert this section immediately before "## Adding a server":

```markdown
## Snapshot & drift (tripwire change-detection)

`snapshot` records a blessed baseline of each server's security-relevant state; `drift` re-captures
and flags anything that changed vs that baseline — and keeps flagging it until you `accept` it. State
lives in `state/<name>.{baseline,current}.json` (gitignored, sensitive; keyed by **server name**).
See `references/operations.md` for the JSON schema, determinism rules, the `snapshot.sh` grammar, and
the severity rubric.
```

- [ ] **Step 4: Update the frontmatter examples** — `SKILL.md`

In the `description:` field, add two examples to the list so the skill is discoverable for change
detection. Insert `"/h-ops drift web-prod", "/h-ops snapshot all",` into the existing examples (e.g.
right after the `"/h-ops audit"` example).

- [ ] **Step 5: List the new sub-commands** — `commands/h-ops.md`

Update the routing line to include the three sub-commands:

```markdown
Route per the skill's SKILL.md (sub-commands: `connect`, `overview`, `health`, `run`, `audit`,
`deploy`, `snapshot`, `drift`, `accept`). Read `~/.claude/skills/h-ops/inventory.yml` first to resolve
server/group names, and follow the skill's safety rules. With no arguments, print the usage summary
and the list of known servers.
```

(Also update the one-line `description:` in its frontmatter to end with `…run, audit, deploy, snapshot, drift, accept)`.)

- [ ] **Step 6: Add README sub-command rows** — `README.md`

Add these rows to the "Sub-commands" table (after the `deploy` row):

```markdown
| `/h-ops snapshot <srv\|group\|all>` | Capture a blessed baseline of each server's security-relevant state (containers, ports, firewall, accounts, SSH-key fingerprints, config checksums). |
| `/h-ops drift <srv\|group\|all>` | Compare live state vs the baseline and flag unexpected changes by severity (🔴/🟡/🟢). |
| `/h-ops accept <srv> [--only <section>]` | Bless reviewed changes into the baseline (tripwire); shows the diff and confirms first. |
```

And add a bullet to the "How it works" list:

```markdown
- **Change detection (tripwire):** `snapshot` writes a blessed baseline and `drift` flags anything
  that changed until you `accept` it. State lives in `state/<name>.{baseline,current}.json` — local,
  gitignored, and never published (it holds a real-fleet fingerprint).
```

Finally, extend the gitignore sentence near the bottom to mention state:

```markdown
All of `inventory.yml`, `servers/<name>.md`, `references/deploy-playbooks.md`, `secrets.local.yml`,
and `state/` are gitignored.
```

- [ ] **Step 7: Document the extra-config-checksums convention** — `servers/_example.md`

Append this section to the example manual:

```markdown
## Snapshot — extra config checksums (optional)
- Extra absolute file paths for `snapshot`/`drift` to checksum, one per line, in addition to the
  built-in set (reverse-proxy config, `sshd_config`, `/etc/sudoers`). Example:
  - /etc/fail2ban/jail.local
  - /etc/myapp/app.conf
```

- [ ] **Step 8: Verify the edits landed**

Run:
```bash
grep -c 'snapshot\|drift\|accept' SKILL.md && \
grep -q 'snapshot' commands/h-ops.md && \
grep -q 'drift' README.md && \
grep -q 'extra config checksums' servers/_example.md && echo OK
```
Expected: a non-zero count, then `OK` on its own line.

- [ ] **Step 9: Run the full suite (docs grammar-sync still green)**

Run: `node --test`
Expected: PASS (the Task 4 grammar-sync test still holds; nothing here changes markers).

- [ ] **Step 10: Commit**

```bash
git add SKILL.md commands/h-ops.md README.md servers/_example.md
git commit -m "docs(snapshot): route snapshot/drift/accept + discoverability"
```

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| Three sub-commands `snapshot`/`drift`/`accept` (kept separate) | T4 (how-to), T5 (router) |
| `scripts/snapshot.sh <alias>` canonical sorted text dump, all four surfaces, read-only, graceful degradation | T1 |
| Structured JSON state; semantic diff; serialize dump → schema | T4 (schema + grammar mapping) |
| State keyed by server name; scripts get aliases only | Global Constraints; T4 step 3 |
| Blessed baseline + accept (tripwire); first-run establishes baseline explicitly | T4 (snapshot/accept), T5 (tripwire paragraph) |
| `accept --only <section>` = replace named top-level key | T4 (accept section) |
| Built-in default config set + per-server extension in `servers/<name>.md` | T1 (default set + `"$@"`), T4 (convention), T5 (template) |
| Determinism rules; `captured_at` ignored in diff | T1 (sorting/normalization), T4 (rules) |
| `(none)` vs `(unavailable)` distinction (avoid false drift) | T1 (`emit_list`), T4 (diff note) |
| No secret capture (SHA256 fingerprints, named sshd fields) | T1 (`ssh-keygen -lf`, sshd field allow-list) |
| Drift classification 🔴/🟡/🟢 | T4 (rubric) |
| Drift exit-code convention (open note resolved: 2/1/0) | T4 (DRIFT:2/1/0) |
| `state/` gitignored, sensitive, preserved by `update`, excluded from npm whitelist | T2 (gitignore + manifest + update test); whitelist already covers `scripts/`, excludes `state/` |
| `snapshot.sh` ships as framework file | T2 (manifest) |
| `doctor` light non-fatal `state/` check | T3 |
| SKILL.md router + accept safety + tripwire doc | T5 |
| operations.md detailed how-to + schema + rubric | T4 |
| Inventory: no schema change | (none — confirmed; nothing touches inventory.js) |
| No history / no scheduled execution / no manual auto-update / no new dep | Non-goals — nothing in any task adds these |

**2. Placeholder scan** — no `TBD`/`add appropriate…`/"similar to Task N" placeholders; `snapshot.sh`, the doctor edits, manifest/gitignore edits, and all doc blocks are shown in full.

**3. Type / name consistency** — the `[MARKER]` set is identical in T1 (script + `test/snapshot-script.test.js`), T4 (`operations.md` + `test/snapshot-docs.test.js`), and the Global Constraints list. `accept --only` sections (`containers`/`network`/`access`/`system`) match the top-level JSON keys in the schema. `doctor` checks gain a `fatal` field used consistently by both the summary computation and the new tests. `update`/`copyFramework`/`SKILL_FILES` shapes are unchanged from the existing code.

**Note (no task needed):** framework-only `uninstall` already preserves `state/` — `removeFrameworkOnly` only deletes `SKILL_FILES` and prunes empty `scripts`/`references`/`servers` dirs, and `state/` is in none of those; `--purge` removes the whole skill dir (incl. `state/`), which is the intended "delete everything" behavior. No uninstall change is required.
