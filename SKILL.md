---
name: h-ops
description: Unified DevOps toolkit for a self-managed server fleet. Use when the user wants to connect to, inspect, audit, run commands across, or deploy to any server in their inventory — e.g. "/h-ops overview", "/h-ops connect web-prod", "/h-ops health db-1", "/h-ops run all 'docker ps'", "/h-ops audit", "/h-ops drift web-prod", "/h-ops snapshot all", "/h-ops deploy web-prod". Inventory-driven; one skill for the whole fleet.
---

# h-ops — server fleet DevOps toolkit

Single source of truth: `inventory.yml` (in this skill dir). It lists every server with its
`ssh_alias`, `role`, `reverse_proxy`, `tags`, and `notes_file`. **The inventory contains no
secrets.** Per-server operating context lives in `servers/<name>.md`.

> First run / no inventory yet? Copy `inventory.example.yml` to `inventory.yml` and fill in your
> servers (their `ssh_alias` must match `~/.ssh/config`). `inventory.yml`, `servers/<name>.md` and
> `secrets.local.yml` are gitignored — your real fleet data stays local.

## How to route a `/h-ops` invocation

Parse `$ARGUMENTS` as `<sub-command> [args...]`. Always read `inventory.yml` first to resolve
server/group names. Resolution:
- a server **name** (a key under `servers:`) → that one `ssh_alias`
- a **group** name (a key under `groups:`, e.g. `prod`, `dev`, `all`) → its list of aliases
- `all` → every server's alias

| Sub-command | Action |
|-------------|--------|
| `overview` | `scripts/overview.sh <alias...>` for every server, print the returned table. |
| `health <srv>` | `scripts/health.sh <alias>`. Then add TLS cert-expiry for the server's domains (see below). |
| `audit [srv\|all]` | `scripts/audit.sh <alias...>` (default `all` if omitted). Summarize findings; flag anything risky. |
| `run <srv\|group\|all> "<cmd>"` | `scripts/run.sh "<cmd>" <alias...>`. Apply safety rules before mutating commands. |
| `connect <srv>` | Read `servers/<name>.md` for context, then `ssh <alias>`, run a quick health check (`uptime`, `df -h /`, `free -h`, `docker ps`), then wait for the user's admin instructions. |
| `deploy <srv>` | Follow the matching playbook in `references/deploy-playbooks.md`. Confirm before acting on a `prod` server. |
| `snapshot <srv\|group\|all>` | `scripts/snapshot.sh <alias>` per target; serialize the dump to `state/<name>.current.json`. First capture also writes `state/<name>.baseline.json` (the blessed baseline) and says so. Read-only. |
| `drift <srv\|group\|all>` | Capture current, **semantically compare** vs the baseline, classify changes 🔴/🟡/🟢, print a grouped report. Never changes the baseline. |
| `accept <srv> [--only <section>]` | Fold reviewed current state into the baseline (tripwire). **Show the diff and confirm before writing.** `--only containers\|network\|access\|system` merges one section. |
| (none / unknown) | Print a short usage list of sub-commands + the server names from `inventory.yml`. |

For detailed how-to per sub-command, read `references/operations.md` on demand.

TLS cert-expiry check (for `health`): for each domain in the server's `servers/<name>.md`, run locally
`echo | openssl s_client -servername <domain> -connect <domain>:443 2>/dev/null | openssl x509 -noout -enddate`.

## Safety rules (NON-NEGOTIABLE)

1. **Read-only by default.** `overview`, `health`, `audit`, and read-only `run` commands execute
   without asking.
2. **Confirm before mutate on `role: prod`.** Before restart/stop/recreate containers, editing the
   reverse proxy (nginx/Caddy) config, package upgrades, or any destructive command on a prod host,
   state exactly what will run and get the user's confirmation.
3. **Never fan-out a mutating command across `all` (or any multi-server group) without explicit
   confirmation**, even for dev hosts.
4. **Respect per-server landmines** in `servers/<name>.md` (e.g. low-RAM hosts, required bind-mounts,
   "ports must stay bound to 127.0.0.1") before acting.
5. **Never print secrets.** Use key auth via the ssh alias. Only fall back to a password (from memory
   or `secrets.local.yml`) if key auth fails, and never echo it.
6. **`accept` confirms before writing; never dump state files.** `snapshot`/`drift` are read-only on
   hosts (run freely). `accept` rewrites a local baseline (a security action) — always show the exact
   diff and confirm; never auto-accept. State under `state/` is sensitive-operational: show only
   diffs/summaries, never paste a whole state file into chat.

## Snapshot & drift (tripwire change-detection)

`snapshot` records a blessed baseline of each server's security-relevant state; `drift` re-captures
and flags anything that changed vs that baseline — and keeps flagging it until you `accept` it. State
lives in `state/<name>.{baseline,current}.json` (gitignored, sensitive; keyed by **server name**).
See `references/operations.md` for the JSON schema, determinism rules, the `snapshot.sh` grammar, and
the severity rubric.

## Adding a server

Edit `inventory.yml` (add under `servers:` and to the relevant `groups:`), optionally add
`servers/<name>.md`. No script or SKILL.md change needed.
