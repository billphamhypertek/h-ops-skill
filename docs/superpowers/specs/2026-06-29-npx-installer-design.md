# h-ops-skill npx installer — design spec

**Date:** 2026-06-29
**Status:** Approved (brainstorming) — pending implementation plan

## Goal

Replace the manual `git clone` + `ln -s` install in the README with a published npm
package so any user can run `npx h-ops-skill init` to install the h-ops skill into Claude
Code, configure their fleet via an interactive wizard, and later update, inspect, or remove
the install. The user's real fleet data must never leak to npm and must never be clobbered
by a framework update.

## Decisions (locked during brainstorming)

| Decision | Choice |
|----------|--------|
| Distribution | Publish to the npm registry → `npx h-ops-skill init`. (Code also works via `npx github:billphamhypertek/h-ops-skill` for pre-publish testing.) |
| `init` UX | Interactive wizard (prompt per server). |
| Command surface | `init`, `update`, `doctor`, `uninstall`, `add-server`. |
| Inventory read/write | One dependency: `yaml` (eemeli/yaml, pure-JS, no transitive deps). Robust parse of hand-edited inventory; preserve comments on edit. |
| `~/.ssh/config` | Print a suggested `Host` snippet only. Never auto-edit the user's ssh config. |

## Non-goals (YAGNI)

- No auto-editing of `~/.ssh/config`.
- No Claude Code plugin/marketplace packaging — keep the existing `skills/` + `commands/`
  layout the repo already uses.
- No secret management beyond what the skill already documents (`secrets.local.yml` stays a
  user-owned, gitignored, never-published file).

## Packaging

- `package.json`:
  - `bin: { "h-ops-skill": "bin/cli.js" }`
  - `engines: { "node": ">=18" }` (stable `node:readline/promises` and `node:test`)
  - `dependencies: { "yaml": "^2" }`
  - `type: "module"` (ESM; matches `import.meta.url` path resolution)
  - **`files` whitelist** (prevents publishing real fleet data):
    `["bin/", "src/", "SKILL.md", "scripts/", "references/operations.md",
      "references/deploy-playbooks.example.md", "inventory.example.yml",
      "servers/_example.md", "commands/h-ops.md", "README.md", "LICENSE"]`
  - Real data (`inventory.yml`, `servers/*.md` except `_example.md`,
    `references/deploy-playbooks.md`, `secrets.local.*`) is excluded by the whitelist AND
    already gitignored — double protection.
- The package ships **both** the installer (`bin/` + `src/`) and the skill payload (the
  framework files listed above).

## Install targets & file classification

- `claudeDir = process.env.CLAUDE_CONFIG_DIR || join(os.homedir(), '.claude')`
- `skillDir  = join(claudeDir, 'skills', 'h-ops')`
- `commandPath = join(claudeDir, 'commands', 'h-ops.md')`

**Framework files** (safe to overwrite on `update`) — source in package → dest:

| Source (package root) | Dest |
|-----------------------|------|
| `SKILL.md` | `<skillDir>/SKILL.md` |
| `scripts/*.sh` | `<skillDir>/scripts/*.sh` (chmod 755) |
| `references/operations.md` | `<skillDir>/references/operations.md` |
| `references/deploy-playbooks.example.md` | `<skillDir>/references/deploy-playbooks.example.md` |
| `inventory.example.yml` | `<skillDir>/inventory.example.yml` |
| `servers/_example.md` | `<skillDir>/servers/_example.md` |
| `README.md`, `LICENSE` | `<skillDir>/` (reference convenience) |
| `commands/h-ops.md` | `<commandPath>` |

**User-data files** (NEVER overwritten by `update`, created by wizard, gitignored):
`<skillDir>/inventory.yml`, `<skillDir>/servers/<name>.md` (non-`_example`),
`<skillDir>/references/deploy-playbooks.md`, `<skillDir>/secrets.local.yml`.

## Code structure (small, single-purpose modules)

```
bin/cli.js                  # shebang, arg parse, dispatch, top-level try/catch → exit code
src/commands/init.js
src/commands/update.js
src/commands/doctor.js
src/commands/uninstall.js
src/commands/add-server.js
src/lib/paths.js            # resolve claudeDir / skillDir / commandPath / pkgRoot
src/lib/manifest.js         # framework↔dest mapping + file classification
src/lib/copy.js             # copy file/dir, chmod 755 scripts, atomic write (temp+rename)
src/lib/inventory.js        # read() / render(servers) / addServer() (preserve comments)
src/lib/prompt.js           # readline/promises wrapper: ask(q, {default, validate, choices})
src/lib/sshconfig.js        # parse ~/.ssh/config Host entries; renderSnippet(server)
test/*.test.js              # node:test + node:assert (zero test deps)
```

## Command behavior

### `init`
1. Abort if already installed: `<skillDir>/inventory.yml` exists, OR `skillDir` is a symlink
   (a dev/symlink install). Message points to `update` / `add-server`.
2. `mkdir -p` `<skillDir>/{scripts,references,servers}` and the commands dir.
3. Copy framework manifest (chmod scripts 755); copy command to `<commandPath>`.
4. **Wizard loop** ("Add a server? [Y/n]"): per server collect `ssh_alias` (required, unique),
   `host`, `user`, `role` (prod|dev|staging|backup), `reverse_proxy` (nginx|caddy|traefik|none),
   `tags` (comma list), `auth` (ssh-key|password, default ssh-key). Zero servers is allowed
   (just leaves the example for later editing).
5. Render `inventory.yml` (servers map + `groups` by role + `all`).
6. Per server, create `servers/<alias>.md` from `_example.md` with the header and snapshot
   line pre-filled (`# <alias> — operating manual`, `ssh <alias> (<user>@<host> …)`).
7. Print suggested `~/.ssh/config` snippet(s) + next steps + "run `npx h-ops-skill doctor`".

### `update`
1. Abort if `skillDir` missing → tell user to run `init`.
2. Abort if `skillDir` is a symlink → "dev install detected; update via `git pull` in the repo".
3. Copy framework manifest (overwrite) + command; chmod scripts. Report each file written.
4. Never touch user-data files.

### `add-server`
1. Require `<skillDir>/inventory.yml`.
2. `yaml.parseDocument` (preserve comments); reject duplicate alias.
3. Run the single-server wizard; append the server + update `groups`; atomic write.
4. Create `servers/<alias>.md`; print ssh snippet.

### `doctor`
- PATH checks: `ssh`, `bash`, `column`, `openssl`, `rsync` (rsync flagged as deploy-only).
- Node version; skill installed?; command installed?
- `inventory.yml` present & parses?; list servers.
- Parse `~/.ssh/config` Host entries; per inventory `ssh_alias`, matching `Host`? (✓/✗).
- `--connect` flag: `ssh -o BatchMode=yes -o ConnectTimeout=5 <alias> true` per server.
- Print a ✓/✗ checklist; exit non-zero if any critical check fails (CI-friendly).

### `uninstall`
- If `skillDir` is a **symlink** → only `unlink` it (NEVER recurse-delete the target repo);
  unlink the command; report.
- If `skillDir` is a real dir → default: remove framework files + command, KEEP user-data,
  print remaining data paths. Prompt "Also delete your fleet data? [y/N]" (or `--purge`).
  `--yes` skips prompts (keeps data).

## Error handling & safety

- Every command wrapped in try/catch in `cli.js` → print `Error: …`, exit 1.
- Never recurse-delete through a symlink (protects the dev repo).
- Never overwrite user-data on `update`.
- Atomic `inventory.yml` writes (temp file + rename) to avoid corruption.
- Non-TTY/piped input → wizard uses defaults or errors clearly instead of hanging.

## Testing

- `node:test` + `node:assert` (zero test deps).
- Each test sets `CLAUDE_CONFIG_DIR` to a temp dir and calls command functions directly,
  injecting scripted input into the prompt wrapper.
- Cases: `init` builds the expected tree; `init` refuses when already installed; `update`
  overwrites framework files but preserves a hand-edited `inventory.yml`; `uninstall` on a
  symlink only unlinks (assert the target repo survives); `doctor` flags a missing ssh alias;
  `add-server` appends and rejects a duplicate alias.

## Docs

- Update README: replace the manual git-clone block with `npx h-ops-skill init`; document
  `update` / `doctor` / `uninstall` / `add-server`; keep a "dev / manual (symlink)" subsection
  for contributors.

## Open follow-ups (out of scope for this spec)

- Actual `npm publish` (requires creating an npm account + login).
- Optional GitHub Action to publish on tag.
