# h-ops

A single, inventory-driven **DevOps toolkit skill** for managing a self-hosted server fleet from
[Claude Code](https://claude.com/claude-code). One command — `/h-ops` — connects to, inspects,
audits, runs commands across, and deploys to any server in your inventory.

> **Your real fleet data never leaves your machine.** This repo ships only the generic framework and
> examples. Your `inventory.yml`, per-server manuals, and secrets are gitignored.

## Sub-commands

| Command | What it does |
|---------|--------------|
| `/h-ops connect <srv>` | SSH in, quick health check, then wait for your admin instructions. |
| `/h-ops overview` | Status table for the whole fleet (reachable, load, disk %, RAM, # containers). |
| `/h-ops health <srv>` | Deep single-server check (load, disk, docker restarts, OOM, TLS cert expiry). |
| `/h-ops run <srv\|group\|all> "<cmd>"` | Run a command on one server or fan it out across a group. |
| `/h-ops audit [srv\|all]` | Security/ops audit: open ports, sudoers, pending updates, disk, root containers. |
| `/h-ops deploy <srv>` | Run an app-specific deploy playbook (confirms before acting on prod). |
| `/h-ops snapshot <srv\|group\|all>` | Capture a blessed baseline of each server's security-relevant state (containers, ports, firewall, accounts, SSH-key fingerprints, config checksums). |
| `/h-ops drift <srv\|group\|all>` | Compare live state vs the baseline and flag unexpected changes by severity (🔴/🟡/🟢). |
| `/h-ops accept <srv> [--only <section>]` | Bless reviewed changes into the baseline (tripwire); shows the diff and confirms first. |

## How it works

- **`inventory.yml`** is the single source of truth — one entry per server with its `ssh_alias`,
  `role`, `reverse_proxy`, `tags`, and a pointer to its operating manual. **No secrets.**
- The fan-out **scripts** (`scripts/*.sh`) take SSH aliases as arguments — they never parse YAML.
  Claude reads the inventory, resolves a server/group/`all` to a list of aliases, and calls the
  script. No `yq`/PyYAML dependency.
- **`servers/<name>.md`** holds each server's present-tense operating manual (services, ports,
  landmines, playbooks).
- Connection uses your existing key-based SSH config (`~/.ssh/config` aliases). Read-only operations
  run freely; mutating operations on `prod` require confirmation.
- **Change detection (tripwire):** `snapshot` writes a blessed baseline and `drift` flags anything
  that changed until you `accept` it. State lives in `state/<name>.{baseline,current}.json` — local,
  gitignored, and never published (it holds a real-fleet fingerprint).

## Install

```bash
npx github:billphamhypertek/h-ops-skill init
```

> The repo is public, so this works today with no extra setup. Once the package is
> published to npm you can use the shorter alias `npx h-ops-skill init` — both run the
> same installer. Every `npx h-ops-skill <cmd>` below also works as
> `npx github:billphamhypertek/h-ops-skill <cmd>`.

This installs the skill into `~/.claude/skills/h-ops/` and the `/h-ops` command into
`~/.claude/commands/`, then walks you through adding your servers (writing `inventory.yml`,
per-server manuals, and suggested `~/.ssh/config` snippets — it never edits your ssh config).

### Installer commands

| Command | What it does |
|---------|--------------|
| `npx h-ops-skill init` | First-time install + interactive fleet wizard. |
| `npx h-ops-skill add-server` | Add one server to an existing inventory. |
| `npx h-ops-skill update` | Refresh framework files only — never touches your fleet data. |
| `npx h-ops-skill doctor` | Check deps, install, and that each `ssh_alias` has a `Host` in `~/.ssh/config` (`--connect` also tests reachability). |
| `npx h-ops-skill uninstall` | Remove the skill (keeps fleet data by default; `--purge` deletes everything). |

Respects `CLAUDE_CONFIG_DIR` if you've relocated `~/.claude`.

### Dev / manual install (contributors)

```bash
git clone https://github.com/billphamhypertek/h-ops-skill.git
ln -s "$PWD/h-ops-skill" ~/.claude/skills/h-ops
ln -s "$PWD/h-ops-skill/commands/h-ops.md" ~/.claude/commands/h-ops.md
cp ~/.claude/skills/h-ops/inventory.example.yml ~/.claude/skills/h-ops/inventory.yml
```

(`update`/`uninstall` detect a symlinked install and won't clobber your repo.)

## Configure your fleet

1. Copy `inventory.example.yml` → `inventory.yml`, list your servers (each `ssh_alias` must match a
   `Host` in `~/.ssh/config`, key-based and passwordless).
2. For each server, copy `servers/_example.md` → `servers/<name>.md` and fill in its services and
   landmines.
3. For deploys, copy `references/deploy-playbooks.example.md` → `references/deploy-playbooks.md`.

All of `inventory.yml`, `servers/<name>.md`, `references/deploy-playbooks.md`, `secrets.local.yml`,
and `state/` are gitignored.

## Requirements

- Node.js ≥ 18 (only for the `npx` installer; the skill itself is pure bash/ssh).
- Claude Code, `bash`, `ssh`, and (for the aligned overview table) `column` — all standard on macOS/Linux.
- Key-based SSH access to your servers via `~/.ssh/config` aliases.

## License

See [LICENSE](LICENSE).
