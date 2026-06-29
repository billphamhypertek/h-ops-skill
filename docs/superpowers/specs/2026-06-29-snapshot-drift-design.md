# h-ops — snapshot + drift (tripwire change-detection) — design spec

**Date:** 2026-06-29
**Status:** Approved (brainstorming) — pending implementation plan

## Goal

Add change-detection to h-ops so the operator can answer **"did something change on a server
that I didn't do?"** Capture a structured fingerprint of each server's security-relevant state,
store a *blessed baseline*, and on demand compare the live state against that baseline —
surfacing unexpected changes (rogue containers, newly opened ports, new sudo users / SSH keys,
loosened firewall, tampered config) classified by severity. The baseline only moves when the
operator explicitly accepts reviewed changes (tripwire model).

This is the **foundation slice** of the larger h-ops roadmap: the state-capture mechanism it
introduces is the keystone that later slices (`report`, `capacity`, manual-staleness in
`validate`, and the scheduled-alert layer) build on. Those are out of scope here.

## Decisions (locked during brainstorming)

| Decision | Choice |
|----------|--------|
| Primary purpose | Detect **unexpected changes** (security / change-detection), not trend/capacity or manual-accuracy. |
| Surfaces captured | All four: **containers & images**, **network & firewall**, **accounts & access**, **packages/cron/config**. |
| Baseline model | **Blessed baseline + `accept` (tripwire).** Drift always compares live state vs the blessed baseline; unexpected changes keep alerting until accepted. |
| State format | **Structured JSON** (forward-compatible with future `report`/`capacity`). Diff is **semantic** (Claude compares two JSON docs), not byte-wise. |
| State generation | `scripts/snapshot.sh <alias>` emits a **canonical sorted text dump** over SSH; Claude serializes it into the documented JSON schema and writes the state file. (Pure-bash JSON emission is fragile; Claude-in-the-loop is on-ethos and robust.) |
| Command surface | Three new sub-commands: `snapshot`, `drift`, `accept` (kept separate). |
| Config checksums | Built-in **default set** (reverse-proxy config, `sshd_config`, sudoers, crontab) **plus** optional per-server extension declared in `servers/<name>.md`. |
| Partial accept | `accept --only <section>` included in v1 (section-level/coarse merge) — required so the operator can bless benign changes while still being alerted on concerning ones. |

## Non-goals (YAGNI)

- **No history / timestamped snapshots.** Tripwire model keeps only `baseline` + `current` per
  server. (Trend/capacity, which needs history, is a later slice.)
- **No scheduled execution or alerting** in this slice. `drift` only exposes the *seam*
  (concise summary + non-zero exit on drift) so a future `schedule`/`loop` layer can wrap it.
- **No manual auto-update.** Reconciling `servers/<name>.md` against reality is the
  manual-accuracy purpose, explicitly not chosen as primary; out of scope.
- **No new runtime dependency.** No `jq`/`yq` required on host or locally. `jq`, if present on
  a host, may be used opportunistically by `snapshot.sh` but must not be required.
- **No secret capture.** Never private keys, never passwords (see Safety).

## Command surface

Added to the `/h-ops` router (SKILL.md table) alongside the existing six sub-commands.

| Sub-command | Action | Host mutate? |
|-------------|--------|--------------|
| `snapshot <srv\|group\|all>` | For each target: `scripts/snapshot.sh <alias>`, serialize to `state/<name>.current.json`. If **no baseline exists**, also write `state/<name>.baseline.json` (first capture establishes the baseline) and tell the operator. | Read-only |
| `drift <srv\|group\|all>` | For each target: capture current (as above), **semantically compare** vs `state/<name>.baseline.json`, classify changes by severity, print a grouped report. Does **not** modify the baseline. Exit non-zero if any drift is found. | Read-only |
| `accept <srv> [--only <section>]` | Fold reviewed current state into the baseline. Show the exact diff being accepted and **confirm before writing**. Without `--only`: replace whole baseline with current. With `--only <section>` (`containers`/`network`/`access`/`system`): merge just that section. | Writes local file |

Resolution (name/group/`all` → ssh aliases) reuses the existing inventory mechanism; scripts
still receive aliases only and never read YAML. State files are keyed by **server name** (the
inventory key), not the alias.

## State storage

- Directory `state/` in the skill dir, **gitignored** (contains a real-fleet fingerprint:
  bound ports, usernames, key fingerprints, config checksums — sensitive operational data).
- Per server: `state/<name>.baseline.json` (blessed) and `state/<name>.current.json` (latest
  capture). No timestamped history files (tripwire model).
- `state/` is user data: preserved by the installer's `update` (framework-only refresh) and
  not in the npm `files` whitelist, so it is never published.

## JSON schema (canonical)

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

**Determinism rules** (so unchanged state → stable JSON, clean diffs):
- Arrays sorted lexically; object keys in the fixed order shown above; values normalized
  (trimmed, collapsed whitespace).
- `captured_at` (from remote `date -u`) is **metadata: ignored when diffing.**
- Because the diff is semantic, minor formatting drift never produces a false positive; the
  determinism rules exist to keep `accept`'d baseline files clean and reviewable.

## What is captured (the four surfaces)

- **Containers** — running containers: name, `image:tag`, restart policy, published port
  mappings (`docker ps` / `docker inspect`). Catches rogue or silently-changed containers.
- **Network / firewall** — listening sockets with bind address (`ss -tlnH`, fallback
  `netstat`); firewall rules with auto-detected backend (`ufw status` → else `iptables -S` /
  `nft list ruleset`). Catches newly exposed ports and loosened firewall.
- **Access** — shell users (`/etc/passwd` with a real shell), sudo members
  (`getent group sudo`), **SHA256 fingerprints only** of each user's `authorized_keys` (+ key
  comment), and policy fields of `sshd_config` (`PasswordAuthentication`, `PermitRootLogin`,
  `PubkeyAuthentication`, …). The strongest intrusion signal.
- **System** — kernel version; **security-tagged packages only** with versions, plus a single
  hash of the full installed-package set (to flag large churn without listing every package);
  cron jobs and systemd timers (captured directly as the `cron`/`timers` fields, not as file
  checksums); SHA256 checksums of a default config-file set (reverse-proxy config,
  `sshd_config`, `/etc/sudoers`) extensible via `servers/<name>.md`.

**Noise control:** the full package list is deliberately *not* captured (auto-updates would
churn it); only the security set + an aggregate hash. apt unattended-upgrade movement is
classified benign (below).

## Drift classification (Claude judges each change)

- 🔴 **CONCERNING** — new sudo member; new `authorized_keys` fingerprint; new listening port on
  a public (`0.0.0.0`/non-loopback) address; firewall rule removed or loosened;
  `PasswordAuthentication`/`PermitRootLogin` re-enabled; checksum change on a
  security-sensitive config file; new cron job / systemd timer.
- 🟡 **NOTABLE** — container image tag bump (often an expected deploy); a new container that may
  have been added intentionally; non-security package version change.
- 🟢 **BENIGN** — security package auto-updates (unattended-upgrades); ephemeral port churn.

**Output:** per-server section, grouped and sorted by severity, one-line recommendation per
change, ending with a hint: `run /h-ops accept <srv>` (or `accept <srv> --only <section>`) to
bless reviewed changes. For `drift all`, a concise fleet summary line per server precedes the
detail, and the command exits non-zero if any server shows drift (the seam for future alerts).

## Safety

- `snapshot` and `drift` are read-only on hosts → run freely, like `overview`/`audit` (no
  confirm).
- `accept` writes a **local** baseline file (not a host mutation) but is a meaningful security
  action → **always show the diff being accepted and confirm**; never auto-accept.
- **No secret capture:** never private keys, never passwords; `authorized_keys` reduced to
  SHA256 fingerprints (+ comment), never the key body; `sshd_config` reduced to named policy
  fields, never the whole file. State files, though gitignored, are treated as
  sensitive-operational and not dumped wholesale into chat — only diffs/summaries are shown.
- First-run: a `snapshot`/`drift` with no baseline establishes the baseline from current state
  and says so explicitly (no silent "all clear").

## Integration with the existing skill

- **SKILL.md** — add the three sub-commands to the router table; add a one-line safety note for
  `accept` (confirm-before-write); document the tripwire model briefly.
- **references/operations.md** — add detailed how-to for `snapshot` / `drift` / `accept`,
  including the JSON schema, determinism rules, and the classification rubric.
- **scripts/snapshot.sh** — the single new script: takes one ssh alias, emits the canonical
  sorted text dump for all four surfaces, read-only, degrades gracefully without root (same
  `SSH_OPTS` and graceful-degradation style as `audit.sh`/`health.sh`). `drift` and `accept`
  are Claude-orchestrated (drift = snapshot.sh + compare; accept = file copy/merge).
- **.gitignore** — add `state/`.
- **Installer** — `snapshot.sh` ships as a framework file (already covered by the `scripts/`
  entry in the npm `files` whitelist and the installer's framework-file copy). `state/` is user
  data: gitignored, excluded from the whitelist, preserved across `update`. `doctor` gains a
  light, non-fatal check that `state/` exists and is writable.
- **Inventory** — no schema change. Per-server extra config-checksum paths (if any) live in
  `servers/<name>.md`, consistent with how landmines/notes already live there.

## Open implementation notes (for the planning step, not decisions)

- Exact `snapshot.sh` remote command set per surface, and the canonical text grammar Claude
  parses into JSON.
- How `accept --only <section>` merges at section granularity (replace the named top-level key).
- Whether `drift`'s non-zero exit distinguishes severity (e.g. 2 = concerning present, 1 =
  only notable/benign) — useful for the future alert layer.
