# h-ops operations — detailed how-to

All target resolution: read `../inventory.yml`, map name/group/`all` → `ssh_alias` list, pass aliases
to the scripts. Scripts never read YAML.

## connect <srv>
1. Read `../servers/<srv>.md` for current services + landmines.
2. `ssh <alias>` and run a quick health check: `uptime; df -h /; free -h; docker ps`.
3. Wait for the user's instructions. Apply the safety rules before any mutate (prod ⇒ confirm).

## overview
`scripts/overview.sh <alias...>` for every server in `servers:`. Print the table as-is.

## health <srv>
1. `scripts/health.sh <alias>`.
2. TLS cert expiry for each domain listed in `../servers/<srv>.md`:
   `echo | openssl s_client -servername <domain> -connect <domain>:443 2>/dev/null | openssl x509 -noout -enddate`
   Flag anything expiring within 21 days.

## run <srv|group|all> "<cmd>"
`scripts/run.sh "<cmd>" <alias...>`. Before running: if the command mutates state (not a pure read),
or any target is `role: prod`, or it targets a multi-server group/`all`, state exactly what will run
and confirm first.

## audit [srv|all]
`scripts/audit.sh <alias...>` (default to `all`). Summarize: public-bound ports, unexpected sudo
members, pending security updates, disks ≥80%, root containers. Cross-check against each server's
landmines (e.g. a host whose ports should be 127.0.0.1-only).

## deploy <srv>
Follow `deploy-playbooks.md` (your local copy; see `deploy-playbooks.example.md` for the format).
Confirm before acting on a prod server.

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
    {"name": "caddy", "image": "caddy:2.7", "restart": "always", "ports": ["0.0.0.0:80->80/tcp", "0.0.0.0:443->443/tcp"]}
  ],
  "network": {
    "listening": ["0.0.0.0:443", "127.0.0.1:5432"],
    "firewall": {"backend": "ufw", "rules": ["22/tcp ALLOW", "80/tcp ALLOW"]}
  },
  "access": {
    "shell_users": ["ubuntu"],
    "sudo": ["ubuntu"],
    "authorized_keys": {"ubuntu": ["SHA256:abc123 (laptop)"]},
    "sshd": {"passwordauthentication": "no", "permitrootlogin": "no", "pubkeyauthentication": "yes"}
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
| `[ACCESS.SSHD]` | `access.sshd` = `{<field>: <value>}` — the three lowercase `sshd -T` keys: `passwordauthentication`, `permitrootlogin`, `pubkeyauthentication` |
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
  `passwordauthentication`/`permitrootlogin` re-enabled, or `pubkeyauthentication` disabled; checksum change on a security-sensitive
  config file (`sshd_config`, `/etc/sudoers`); new cron job / systemd timer.
- 🟡 **NOTABLE** — container image tag bump (often an expected deploy); a new container that may be
  intentional; non-security package version change.
- 🟢 **BENIGN** — security package auto-updates (unattended-upgrades); ephemeral listening-port churn.
