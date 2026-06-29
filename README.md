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

## Install (manual, for now)

```bash
git clone https://github.com/billphamhypertek/h-ops-skill.git
ln -s "$PWD/h-ops-skill" ~/.claude/skills/h-ops
ln -s "$PWD/h-ops-skill/commands/h-ops.md" ~/.claude/commands/h-ops.md
cp ~/.claude/skills/h-ops/inventory.example.yml ~/.claude/skills/h-ops/inventory.yml
# then edit inventory.yml with your servers (ssh_alias must match ~/.ssh/config)
```

An `npx` installer is planned to automate this.

## Configure your fleet

1. Copy `inventory.example.yml` → `inventory.yml`, list your servers (each `ssh_alias` must match a
   `Host` in `~/.ssh/config`, key-based and passwordless).
2. For each server, copy `servers/_example.md` → `servers/<name>.md` and fill in its services and
   landmines.
3. For deploys, copy `references/deploy-playbooks.example.md` → `references/deploy-playbooks.md`.

All of `inventory.yml`, `servers/<name>.md`, `references/deploy-playbooks.md`, and `secrets.local.yml`
are gitignored.

## Requirements

- Claude Code, `bash`, `ssh`, and (for the aligned overview table) `column` — all standard on macOS/Linux.
- Key-based SSH access to your servers via `~/.ssh/config` aliases.

## License

See [LICENSE](LICENSE).
