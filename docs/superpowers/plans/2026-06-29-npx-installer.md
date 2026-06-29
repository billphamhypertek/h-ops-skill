# h-ops-skill npx installer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a published-to-npm CLI (`npx h-ops-skill <cmd>`) that installs, updates, inspects, and removes the h-ops Claude Code skill, with an interactive wizard for fleet configuration.

**Architecture:** ESM Node package. A thin `bin/cli.js` parses argv and dispatches to command modules (`src/commands/*.js`), each composed from small single-purpose libs (`src/lib/*.js`). Commands take injectable dependencies (`ask`, `env`, `log`) so they run headless in tests via `CLAUDE_CONFIG_DIR` + a scripted `ask`. The package ships both the installer and the skill payload; framework files copy into `~/.claude/skills/h-ops/` while user data is never overwritten.

**Tech Stack:** Node ≥18 (ESM), one runtime dep `yaml` (eemeli/yaml), `node:test` + `node:assert/strict` for tests (zero test deps), `node:readline/promises` for the wizard.

## Global Constraints

- `package.json`: `type: "module"`, `bin: { "h-ops-skill": "bin/cli.js" }`, `engines.node ">=18"`, `dependencies: { "yaml": "^2" }`, `scripts.test: "node --test"`.
- `files` whitelist MUST be exactly: `["bin/", "src/", "SKILL.md", "scripts/", "references/operations.md", "references/deploy-playbooks.example.md", "inventory.example.yml", "servers/_example.md", "commands/h-ops.md", "README.md", "LICENSE"]`. Never ship real data.
- Install base: `claudeDir = process.env.CLAUDE_CONFIG_DIR || ~/.claude`; `skillDir = <claudeDir>/skills/h-ops`; `commandPath = <claudeDir>/commands/h-ops.md`.
- User-data files (NEVER overwritten by `update`, preserved by `uninstall` unless `--purge`): `inventory.yml`, `servers/<name>.md` (except `_example.md`), `references/deploy-playbooks.md`, `secrets.local.{yml,yaml}`.
- NEVER recurse-delete through a symlink. NEVER auto-edit `~/.ssh/config` (print snippet only).
- All inventory writes are atomic (temp file + rename).
- Commit after each task. Conventional commit messages. Work on branch `feat/npx-installer`.

---

### Task 1: Package scaffold + CLI skeleton

**Files:**
- Create: `package.json`
- Create: `bin/cli.js`
- Create: `test/cli.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `bin/cli.js` runnable entry printing usage; `npm test` wired.

- [ ] **Step 1: Write the failing test** — `test/cli.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

test('--help prints usage and exits 0', () => {
  const r = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:\s+npx h-ops-skill/);
  assert.match(r.stdout, /init\b/);
  assert.match(r.stdout, /uninstall\b/);
});

test('unknown command exits 1', () => {
  const r = spawnSync('node', [CLI, 'bogus'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /Unknown command/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cli.test.js`
Expected: FAIL (`bin/cli.js` does not exist → spawn error / non-zero).

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "h-ops-skill",
  "version": "0.1.0",
  "description": "Installer for the h-ops Claude Code skill — inventory-driven DevOps toolkit for a self-managed server fleet.",
  "type": "module",
  "bin": { "h-ops-skill": "bin/cli.js" },
  "engines": { "node": ">=18" },
  "scripts": { "test": "node --test" },
  "dependencies": { "yaml": "^2" },
  "files": [
    "bin/",
    "src/",
    "SKILL.md",
    "scripts/",
    "references/operations.md",
    "references/deploy-playbooks.example.md",
    "inventory.example.yml",
    "servers/_example.md",
    "commands/h-ops.md",
    "README.md",
    "LICENSE"
  ],
  "license": "MIT",
  "repository": { "type": "git", "url": "https://github.com/billphamhypertek/h-ops-skill.git" }
}
```

- [ ] **Step 4: Create `bin/cli.js`** (dispatch table; command impls land in later tasks)

```js
#!/usr/bin/env node
import { init } from '../src/commands/init.js';
import { update } from '../src/commands/update.js';
import { doctor } from '../src/commands/doctor.js';
import { uninstall } from '../src/commands/uninstall.js';
import { addServer } from '../src/commands/add-server.js';
import { createAsk } from '../src/lib/prompt.js';

const USAGE = `h-ops-skill — installer for the h-ops Claude Code skill

Usage:
  npx h-ops-skill <command> [options]

Commands:
  init          Install the skill and configure your fleet (interactive wizard)
  update        Refresh framework files only (keeps your fleet data)
  add-server    Add one server to an existing inventory
  doctor        Check environment, install, and ssh config   [--connect]
  uninstall     Remove the skill                              [--purge] [--yes]
`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    process.stdout.write(USAGE);
    return;
  }
  if (cmd === 'update') { update({}); return; }
  if (cmd === 'doctor') {
    const r = doctor({ connect: flags.has('--connect') });
    if (!r.ok) process.exitCode = 1;
    return;
  }
  const ask = createAsk();
  try {
    if (cmd === 'init') await init({ ask });
    else if (cmd === 'add-server') await addServer({ ask });
    else if (cmd === 'uninstall') await uninstall({ ask, purge: flags.has('--purge'), yes: flags.has('--yes') });
    else { process.stdout.write(`Unknown command: ${cmd}\n\n${USAGE}`); process.exitCode = 1; }
  } finally {
    ask.close();
  }
}

main().catch((e) => { process.stderr.write(`Error: ${e.message}\n`); process.exitCode = 1; });
```

NOTE: this imports modules created in later tasks. Until Task 13, the `--help` and `Unknown command` paths (tested here) do not touch those imports' bodies, but the imports must resolve. To keep Task 1 green in isolation, create empty stub files now:

```bash
mkdir -p src/commands src/lib
for f in src/commands/init.js src/commands/update.js src/commands/doctor.js src/commands/uninstall.js src/commands/add-server.js; do
  printf 'export function %s(){throw new Error("not implemented");}\n' "$(basename "$f" .js | sed 's/-server/Server/;s/^add/add/')" > "$f"
done
printf 'export const init = async () => { throw new Error("not implemented"); };\n' > src/commands/init.js
printf 'export const update = () => { throw new Error("not implemented"); };\n' > src/commands/update.js
printf 'export const doctor = () => ({ ok: false, checks: [] });\n' > src/commands/doctor.js
printf 'export const uninstall = async () => { throw new Error("not implemented"); };\n' > src/commands/uninstall.js
printf 'export const addServer = async () => { throw new Error("not implemented"); };\n' > src/commands/add-server.js
printf 'export const createAsk = () => { const a = async () => ""; a.close = () => {}; return a; };\n' > src/lib/prompt.js
```

- [ ] **Step 5: Install deps**

Run: `npm install`
Expected: creates `node_modules/` and `package-lock.json`; `yaml` present.

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test test/cli.test.js`
Expected: PASS (both tests).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json bin/ src/ test/cli.test.js .gitignore
git commit -m "feat(installer): package scaffold + CLI skeleton"
```

NOTE: also add `node_modules/` to `.gitignore` in this step:

```bash
printf '\n# npm\nnode_modules/\n' >> .gitignore
```

---

### Task 2: `src/lib/paths.js`

**Files:**
- Create: `src/lib/paths.js`
- Test: `test/paths.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `getPaths(env) → { claudeDir, skillDir, commandsDir, commandPath }`; `getPkgRoot() → string` (absolute path to package root, trailing slash).

- [ ] **Step 1: Write the failing test** — `test/paths.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getPaths, getPkgRoot } from '../src/lib/paths.js';

test('getPaths honors CLAUDE_CONFIG_DIR', () => {
  const p = getPaths({ CLAUDE_CONFIG_DIR: '/tmp/cc' });
  assert.equal(p.claudeDir, '/tmp/cc');
  assert.equal(p.skillDir, path.join('/tmp/cc', 'skills', 'h-ops'));
  assert.equal(p.commandPath, path.join('/tmp/cc', 'commands', 'h-ops.md'));
});

test('getPaths falls back to ~/.claude', () => {
  const p = getPaths({});
  assert.match(p.claudeDir, /\.claude$/);
});

test('getPkgRoot points at the package root', () => {
  assert.ok(fs.existsSync(path.join(getPkgRoot(), 'package.json')));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/paths.test.js`
Expected: FAIL (`getPaths` not exported).

- [ ] **Step 3: Implement** — `src/lib/paths.js`

```js
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function getPaths(env = process.env) {
  const claudeDir = env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const skillDir = path.join(claudeDir, 'skills', 'h-ops');
  const commandsDir = path.join(claudeDir, 'commands');
  const commandPath = path.join(commandsDir, 'h-ops.md');
  return { claudeDir, skillDir, commandsDir, commandPath };
}

// src/lib/paths.js → up two levels = package root
export function getPkgRoot() {
  return fileURLToPath(new URL('../../', import.meta.url));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/paths.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/paths.js test/paths.test.js
git commit -m "feat(installer): path resolution (getPaths, getPkgRoot)"
```

---

### Task 3: `src/lib/manifest.js`

**Files:**
- Create: `src/lib/manifest.js`
- Test: `test/manifest.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `SKILL_FILES: Array<{path: string, exec?: boolean}>`; `COMMAND_SRC: string`; `USER_DATA_FILES: string[]`; `isUserDataServerManual(relPath: string) → boolean`.

- [ ] **Step 1: Write the failing test** — `test/manifest.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKILL_FILES, COMMAND_SRC, USER_DATA_FILES, isUserDataServerManual } from '../src/lib/manifest.js';

test('SKILL_FILES includes SKILL.md and executable scripts', () => {
  const paths = SKILL_FILES.map((f) => f.path);
  assert.ok(paths.includes('SKILL.md'));
  const overview = SKILL_FILES.find((f) => f.path === 'scripts/overview.sh');
  assert.equal(overview.exec, true);
});

test('COMMAND_SRC is the command file', () => {
  assert.equal(COMMAND_SRC, 'commands/h-ops.md');
});

test('USER_DATA_FILES protects inventory and deploy playbooks', () => {
  assert.ok(USER_DATA_FILES.includes('inventory.yml'));
  assert.ok(USER_DATA_FILES.includes('references/deploy-playbooks.md'));
});

test('isUserDataServerManual distinguishes example from real manuals', () => {
  assert.equal(isUserDataServerManual('servers/web.md'), true);
  assert.equal(isUserDataServerManual('servers/_example.md'), false);
  assert.equal(isUserDataServerManual('SKILL.md'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/manifest.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `src/lib/manifest.js`

```js
// Files copied into <skillDir> (paths relative to package root AND skillDir).
export const SKILL_FILES = [
  { path: 'SKILL.md' },
  { path: 'scripts/overview.sh', exec: true },
  { path: 'scripts/run.sh', exec: true },
  { path: 'scripts/health.sh', exec: true },
  { path: 'scripts/audit.sh', exec: true },
  { path: 'references/operations.md' },
  { path: 'references/deploy-playbooks.example.md' },
  { path: 'inventory.example.yml' },
  { path: 'servers/_example.md' },
  { path: 'README.md' },
  { path: 'LICENSE' },
];

// Copied to <commandPath>.
export const COMMAND_SRC = 'commands/h-ops.md';

// User-owned files: never overwritten by `update`; preserved by `uninstall` unless --purge.
export const USER_DATA_FILES = [
  'inventory.yml',
  'references/deploy-playbooks.md',
  'secrets.local.yml',
  'secrets.local.yaml',
];

export function isUserDataServerManual(relPath) {
  return /^servers\/.+\.md$/.test(relPath) && relPath !== 'servers/_example.md';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/manifest.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/manifest.js test/manifest.test.js
git commit -m "feat(installer): file manifest + user-data classification"
```

---

### Task 4: `src/lib/copy.js`

**Files:**
- Create: `src/lib/copy.js`
- Test: `test/copy.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `copyFileTo(src, dest, {exec?}) → void`; `atomicWrite(dest, content) → void`.

- [ ] **Step 1: Write the failing test** — `test/copy.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copyFileTo, atomicWrite } from '../src/lib/copy.js';

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'hops-copy-')); }

test('copyFileTo creates parent dirs and sets exec bit', () => {
  const d = tmp();
  const src = path.join(d, 'src.sh');
  fs.writeFileSync(src, '#!/bin/sh\n');
  const dest = path.join(d, 'nested/out.sh');
  copyFileTo(src, dest, { exec: true });
  assert.equal(fs.readFileSync(dest, 'utf8'), '#!/bin/sh\n');
  assert.ok(fs.statSync(dest).mode & 0o100, 'owner-exec bit set');
});

test('atomicWrite writes content and leaves no temp file', () => {
  const d = tmp();
  const dest = path.join(d, 'a/b.txt');
  atomicWrite(dest, 'hello');
  assert.equal(fs.readFileSync(dest, 'utf8'), 'hello');
  assert.deepEqual(fs.readdirSync(path.dirname(dest)), ['b.txt']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/copy.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `src/lib/copy.js`

```js
import fs from 'node:fs';
import path from 'node:path';

export function copyFileTo(src, dest, { exec = false } = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  if (exec) fs.chmodSync(dest, 0o755);
}

export function atomicWrite(dest, content) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, dest);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/copy.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/copy.js test/copy.test.js
git commit -m "feat(installer): file copy + atomic write helpers"
```

---

### Task 5: `src/lib/install.js` (copyFramework)

**Files:**
- Create: `src/lib/install.js`
- Test: `test/install.test.js`

**Interfaces:**
- Consumes: `SKILL_FILES`, `COMMAND_SRC` (Task 3); `copyFileTo` (Task 4).
- Produces: `copyFramework({pkgRoot, skillDir, commandPath}) → string[]` (relative paths written).

- [ ] **Step 1: Write the failing test** — `test/install.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copyFramework } from '../src/lib/install.js';
import { getPkgRoot } from '../src/lib/paths.js';

test('copyFramework installs SKILL.md, executable scripts, and the command', () => {
  const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-skill-'));
  const commandPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hops-cmd-')), 'h-ops.md');
  const written = copyFramework({ pkgRoot: getPkgRoot(), skillDir, commandPath });

  assert.ok(fs.existsSync(path.join(skillDir, 'SKILL.md')));
  assert.ok(fs.statSync(path.join(skillDir, 'scripts/overview.sh')).mode & 0o100);
  assert.ok(fs.existsSync(commandPath));
  assert.ok(written.includes('SKILL.md'));
  assert.ok(written.includes('commands/h-ops.md'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/install.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `src/lib/install.js`

```js
import path from 'node:path';
import { SKILL_FILES, COMMAND_SRC } from './manifest.js';
import { copyFileTo } from './copy.js';

export function copyFramework({ pkgRoot, skillDir, commandPath }) {
  const written = [];
  for (const f of SKILL_FILES) {
    copyFileTo(path.join(pkgRoot, f.path), path.join(skillDir, f.path), { exec: f.exec });
    written.push(f.path);
  }
  copyFileTo(path.join(pkgRoot, COMMAND_SRC), commandPath);
  written.push(COMMAND_SRC);
  return written;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/install.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/install.js test/install.test.js
git commit -m "feat(installer): copyFramework — install skill payload"
```

---

### Task 6: `src/lib/inventory.js`

**Files:**
- Create: `src/lib/inventory.js`
- Test: `test/inventory.test.js`

**Interfaces:**
- Consumes: `yaml` package.
- Produces:
  - `renderInventory(servers: Server[]) → string`
  - `parseInventory(text: string) → { servers: object, groups: object }`
  - `addServer(text: string, server: Server) → string` (throws on duplicate alias)
- `Server = { ssh_alias, host, user, role, reverse_proxy, auth, os?, tags?: string[] }`.

- [ ] **Step 1: Write the failing test** — `test/inventory.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import YAML from 'yaml';
import { renderInventory, parseInventory, addServer } from '../src/lib/inventory.js';

const web = { ssh_alias: 'web', host: '10.0.0.1', user: 'ubuntu', role: 'prod', reverse_proxy: 'nginx', auth: 'ssh-key', os: 'Ubuntu 22.04', tags: ['docker', 'web'] };
const db = { ssh_alias: 'db', host: '10.0.0.2', user: 'root', role: 'dev', reverse_proxy: 'none', auth: 'ssh-key', tags: ['postgres'] };

test('renderInventory produces valid yaml with servers and groups', () => {
  const text = renderInventory([web, db]);
  const obj = YAML.parse(text);
  assert.equal(obj.servers.web.host, '10.0.0.1');
  assert.equal(obj.servers.web.notes_file, 'servers/web.md');
  assert.deepEqual(obj.groups.prod, ['web']);
  assert.deepEqual(obj.groups.dev, ['db']);
  assert.deepEqual(obj.groups.all, ['web', 'db']);
});

test('parseInventory returns servers map', () => {
  const obj = parseInventory(renderInventory([web]));
  assert.deepEqual(Object.keys(obj.servers), ['web']);
});

test('addServer appends, updates groups, and preserves comments', () => {
  const start = '# my fleet comment\n' + renderInventory([web]);
  const next = addServer(start, db);
  const obj = YAML.parse(next);
  assert.deepEqual(Object.keys(obj.servers), ['web', 'db']);
  assert.deepEqual(obj.groups.all, ['web', 'db']);
  assert.deepEqual(obj.groups.dev, ['db']);
  assert.match(next, /# my fleet comment/);
});

test('addServer rejects duplicate alias', () => {
  const text = renderInventory([web]);
  assert.throws(() => addServer(text, web), /already exists/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/inventory.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `src/lib/inventory.js`

```js
import YAML from 'yaml';

const HEADER = `# h-ops fleet inventory — SINGLE SOURCE OF TRUTH. NO SECRETS HERE. (gitignored: real data)
# Add a server under \`servers:\` and to the relevant \`groups:\`. ssh_alias must match ~/.ssh/config.`;

const ROLE_ORDER = ['prod', 'staging', 'dev', 'backup'];

export function renderInventory(servers) {
  const lines = [HEADER, 'servers:'];
  for (const s of servers) {
    lines.push(`  ${s.ssh_alias}:`);
    lines.push(`    host: ${s.host}`);
    lines.push(`    user: ${s.user}`);
    lines.push(`    ssh_alias: ${s.ssh_alias}`);
    lines.push(`    auth: ${s.auth}`);
    lines.push(`    role: ${s.role}`);
    lines.push(`    reverse_proxy: ${s.reverse_proxy}`);
    if (s.os) lines.push(`    os: ${JSON.stringify(s.os)}`);
    lines.push(`    tags: [${(s.tags || []).join(', ')}]`);
    lines.push(`    notes_file: servers/${s.ssh_alias}.md`);
  }
  lines.push('', 'groups:');
  for (const role of ROLE_ORDER) {
    const members = servers.filter((s) => s.role === role).map((s) => s.ssh_alias);
    if (members.length) lines.push(`  ${role}: [${members.join(', ')}]`);
  }
  lines.push(`  all: [${servers.map((s) => s.ssh_alias).join(', ')}]`);
  return lines.join('\n') + '\n';
}

export function parseInventory(text) {
  return YAML.parse(text) || { servers: {}, groups: {} };
}

export function addServer(text, server) {
  const doc = YAML.parseDocument(text);
  let servers = doc.get('servers');
  if (!servers) { doc.set('servers', {}); servers = doc.get('servers'); }
  if (servers.has(server.ssh_alias)) {
    throw new Error(`Server "${server.ssh_alias}" already exists in inventory.`);
  }
  const node = doc.createNode({
    host: server.host,
    user: server.user,
    ssh_alias: server.ssh_alias,
    auth: server.auth,
    role: server.role,
    reverse_proxy: server.reverse_proxy,
    ...(server.os ? { os: server.os } : {}),
    tags: server.tags || [],
    notes_file: `servers/${server.ssh_alias}.md`,
  });
  const tagsNode = node.get('tags', true);
  if (tagsNode) tagsNode.flow = true;
  servers.set(server.ssh_alias, node);

  let groups = doc.get('groups');
  if (!groups) { doc.set('groups', {}); groups = doc.get('groups'); }
  for (const key of [server.role, 'all']) {
    let seq = groups.get(key);
    if (!seq) { groups.set(key, []); seq = groups.get(key); }
    const has = seq.items.some((it) => (it && it.value !== undefined ? it.value : it) === server.ssh_alias);
    if (!has) seq.add(server.ssh_alias);
    seq.flow = true;
  }
  return String(doc);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/inventory.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inventory.js test/inventory.test.js
git commit -m "feat(installer): inventory render/parse/addServer"
```

---

### Task 7: `src/lib/sshconfig.js`

**Files:**
- Create: `src/lib/sshconfig.js`
- Test: `test/sshconfig.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseHosts(text) → string[]`; `readHosts(configPath) → string[]` (returns `[]` if unreadable); `renderSnippet(server) → string`.

- [ ] **Step 1: Write the failing test** — `test/sshconfig.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHosts, renderSnippet } from '../src/lib/sshconfig.js';

test('parseHosts extracts aliases, ignores comments and wildcards', () => {
  const cfg = `# comment\nHost web db\n    HostName 1.2.3.4\nHost *\n    User x\nHost prod-?\n`;
  assert.deepEqual(parseHosts(cfg), ['web', 'db']);
});

test('renderSnippet formats a Host block', () => {
  const snip = renderSnippet({ ssh_alias: 'web', host: '1.2.3.4', user: 'ubuntu' });
  assert.match(snip, /Host web/);
  assert.match(snip, /HostName 1\.2\.3\.4/);
  assert.match(snip, /User ubuntu/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/sshconfig.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `src/lib/sshconfig.js`

```js
import fs from 'node:fs';

export function parseHosts(text) {
  const hosts = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^Host\s+(.+)$/i);
    if (!m) continue;
    for (const token of m[1].split(/\s+/)) {
      if (token && !token.includes('*') && !token.includes('?')) hosts.push(token);
    }
  }
  return hosts;
}

export function readHosts(configPath) {
  try { return parseHosts(fs.readFileSync(configPath, 'utf8')); }
  catch { return []; }
}

export function renderSnippet(server) {
  return [
    `Host ${server.ssh_alias}`,
    `    HostName ${server.host}`,
    `    User ${server.user}`,
    '    IdentityFile ~/.ssh/id_ed25519',
  ].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/sshconfig.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sshconfig.js test/sshconfig.test.js
git commit -m "feat(installer): ssh config parsing + snippet render"
```

---

### Task 8: `src/lib/manual.js` (renderServerManual)

**Files:**
- Create: `src/lib/manual.js`
- Test: `test/manual.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `renderServerManual(server) → string`.

- [ ] **Step 1: Write the failing test** — `test/manual.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderServerManual } from '../src/lib/manual.js';

test('renderServerManual fills header, ssh line, role', () => {
  const md = renderServerManual({ ssh_alias: 'web', host: '1.2.3.4', user: 'ubuntu', role: 'prod', reverse_proxy: 'nginx', os: 'Ubuntu 22.04' });
  assert.match(md, /^# web — operating manual/m);
  assert.match(md, /ssh web/);
  assert.match(md, /ubuntu@1\.2\.3\.4/);
  assert.match(md, /Role: prod/);
  assert.match(md, /Reverse proxy: nginx/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/manual.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `src/lib/manual.js`

```js
export function renderServerManual(server) {
  const proxy = server.reverse_proxy && server.reverse_proxy !== 'none' ? server.reverse_proxy : 'none';
  return `# ${server.ssh_alias} — operating manual

> Present-tense ops manual. Keep it short and current.

## Snapshot
- \`ssh ${server.ssh_alias}\` (${server.user}@${server.host}, key \`~/.ssh/id_ed25519\`, passwordless). sudo: ?
- OS: ${server.os || '?'}. vCPU / RAM (+swap) / disk: ?
- Reverse proxy: ${proxy} — config path, TLS method.
- Role: ${server.role}.

## Services (current)
- Service → public domain → internal port; compose file location.

## Landmines / must-not-break
- Active constraints phrased as imperatives.

## Operational playbooks
- Quick health: \`ssh ${server.ssh_alias} 'uptime; df -h /; free -h; docker ps'\`.
`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/manual.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/manual.js test/manual.test.js
git commit -m "feat(installer): server manual template renderer"
```

---

### Task 9: `src/lib/prompt.js` + `src/lib/wizard.js`

**Files:**
- Modify: `src/lib/prompt.js` (replace Task 1 stub)
- Create: `src/lib/wizard.js`
- Test: `test/prompt.test.js`
- Test: `test/wizard.test.js`

**Interfaces:**
- Consumes: `node:readline/promises`.
- Produces:
  - `createAsk({input?, output?}) → ask` where `ask(question, {default?, validate?, choices?}) → Promise<string>` and `ask.close()`.
  - `promptServer(ask, {existingAliases?}) → Promise<Server>` (Server shape per Task 6).

- [ ] **Step 1: Write the failing tests**

`test/prompt.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { createAsk } from '../src/lib/prompt.js';

function fakeIO(lines) {
  const input = Readable.from(lines.map((l) => l + '\n'));
  const output = new Writable({ write(_c, _e, cb) { cb(); } });
  return { input, output };
}

test('createAsk returns trimmed answer or default', async () => {
  const { input, output } = fakeIO(['  hi  ', '']);
  const ask = createAsk({ input, output });
  assert.equal(await ask('q1'), 'hi');
  assert.equal(await ask('q2', { default: 'def' }), 'def');
  ask.close();
});
```

`test/wizard.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promptServer } from '../src/lib/wizard.js';

// Scripted ask: returns queued answers in order, ignoring validation.
function scriptedAsk(answers) {
  let i = 0;
  return async () => answers[i++];
}

test('promptServer maps answers to a Server object', async () => {
  const ask = scriptedAsk(['web', '1.2.3.4', 'ubuntu', 'prod', 'nginx', 'Ubuntu 22.04', 'docker, web', 'ssh-key']);
  const s = await promptServer(ask, { existingAliases: [] });
  assert.equal(s.ssh_alias, 'web');
  assert.equal(s.host, '1.2.3.4');
  assert.equal(s.role, 'prod');
  assert.deepEqual(s.tags, ['docker', 'web']);
  assert.equal(s.auth, 'ssh-key');
  assert.equal(s.notes_file, 'servers/web.md');
});

test('promptServer leaves os undefined when blank', async () => {
  const ask = scriptedAsk(['db', '1.1.1.1', 'root', 'dev', 'none', '', '', 'ssh-key']);
  const s = await promptServer(ask, {});
  assert.equal(s.os, undefined);
  assert.deepEqual(s.tags, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/prompt.test.js test/wizard.test.js`
Expected: FAIL (`promptServer` missing; `createAsk` is a stub returning `""`).

- [ ] **Step 3: Implement** — replace `src/lib/prompt.js`

```js
import readline from 'node:readline/promises';

export function createAsk({ input = process.stdin, output = process.stdout } = {}) {
  const rl = readline.createInterface({ input, output });
  async function ask(question, { default: def, validate, choices } = {}) {
    const suffix = def ? ` [${def}]` : choices ? ` (${choices.join('/')})` : '';
    for (;;) {
      const raw = await rl.question(`${question}${suffix}: `);
      const answer = (raw.trim() || def || '');
      if (choices && answer && !choices.includes(answer)) {
        output.write(`  must be one of: ${choices.join(', ')}\n`);
        continue;
      }
      if (validate) {
        const err = validate(answer);
        if (err) { output.write(`  ${err}\n`); continue; }
      }
      return answer;
    }
  }
  ask.close = () => rl.close();
  return ask;
}
```

- [ ] **Step 4: Implement** — `src/lib/wizard.js`

```js
export async function promptServer(ask, { existingAliases = [] } = {}) {
  const ssh_alias = await ask('  ssh_alias (must match ~/.ssh/config)', {
    validate: (v) => (!v ? 'required' : existingAliases.includes(v) ? 'alias already used' : null),
  });
  const host = await ask('  host (IP or hostname)', { validate: (v) => (v ? null : 'required') });
  const user = await ask('  ssh user', { default: 'root' });
  const role = await ask('  role', { choices: ['prod', 'dev', 'staging', 'backup'], default: 'dev' });
  const reverse_proxy = await ask('  reverse_proxy', { choices: ['nginx', 'caddy', 'traefik', 'none'], default: 'none' });
  const os = await ask('  os (optional, e.g. "Ubuntu 24.04")', { default: '' });
  const tagsRaw = await ask('  tags (comma-separated, optional)', { default: '' });
  const auth = await ask('  auth', { choices: ['ssh-key', 'password'], default: 'ssh-key' });
  const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
  return {
    ssh_alias, host, user, role, reverse_proxy,
    os: os || undefined, tags, auth,
    notes_file: `servers/${ssh_alias}.md`,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/prompt.test.js test/wizard.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/prompt.js src/lib/wizard.js test/prompt.test.js test/wizard.test.js
git commit -m "feat(installer): interactive prompt + server wizard"
```

---

### Task 10: `update` command

**Files:**
- Modify: `src/commands/update.js` (replace Task 1 stub)
- Test: `test/update.test.js`

**Interfaces:**
- Consumes: `getPaths`, `getPkgRoot` (Task 2); `copyFramework` (Task 5).
- Produces: `update({env?, log?}) → string[]` (paths written). Throws if not installed or if `skillDir` is a symlink.

- [ ] **Step 1: Write the failing test** — `test/update.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { update } from '../src/commands/update.js';

function tmpClaude() { return fs.mkdtempSync(path.join(os.tmpdir(), 'hops-cc-')); }

test('update overwrites framework but preserves user data', () => {
  const cc = tmpClaude();
  const skillDir = path.join(cc, 'skills', 'h-ops');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'OLD');
  fs.writeFileSync(path.join(skillDir, 'inventory.yml'), 'servers:\n  keep: {}\n');

  update({ env: { CLAUDE_CONFIG_DIR: cc }, log: () => {} });

  assert.notEqual(fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8'), 'OLD');
  assert.match(fs.readFileSync(path.join(skillDir, 'inventory.yml'), 'utf8'), /keep/);
});

test('update refuses when not installed', () => {
  const cc = tmpClaude();
  assert.throws(() => update({ env: { CLAUDE_CONFIG_DIR: cc }, log: () => {} }), /not installed/);
});

test('update refuses a symlinked (dev) install', () => {
  const cc = tmpClaude();
  const skillDir = path.join(cc, 'skills', 'h-ops');
  fs.mkdirSync(path.dirname(skillDir), { recursive: true });
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-repo-'));
  fs.symlinkSync(repo, skillDir);
  assert.throws(() => update({ env: { CLAUDE_CONFIG_DIR: cc }, log: () => {} }), /symlink|Dev install/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/update.test.js`
Expected: FAIL (stub throws "not implemented").

- [ ] **Step 3: Implement** — `src/commands/update.js`

```js
import fs from 'node:fs';
import { getPaths, getPkgRoot } from '../lib/paths.js';
import { copyFramework } from '../lib/install.js';

export function update({ env = process.env, log = console.log } = {}) {
  const { skillDir, commandPath } = getPaths(env);
  if (!fs.existsSync(skillDir)) {
    throw new Error('h-ops is not installed. Run `npx h-ops-skill init` first.');
  }
  if (fs.lstatSync(skillDir).isSymbolicLink()) {
    throw new Error('Dev install detected (symlink). Update via `git pull` in the repo.');
  }
  const written = copyFramework({ pkgRoot: getPkgRoot(), skillDir, commandPath });
  log(`Updated ${written.length} framework file(s) in ${skillDir}`);
  for (const f of written) log(`  ✓ ${f}`);
  log('User data (inventory.yml, servers/*.md, deploy-playbooks.md) left untouched.');
  return written;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/update.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/update.js test/update.test.js
git commit -m "feat(installer): update command (framework-only refresh)"
```

---

### Task 11: `init` command

**Files:**
- Modify: `src/commands/init.js` (replace Task 1 stub)
- Test: `test/init.test.js`

**Interfaces:**
- Consumes: `getPaths`, `getPkgRoot` (Task 2); `copyFramework` (Task 5); `renderInventory` (Task 6); `renderServerManual` (Task 8); `renderSnippet` (Task 7); `promptServer` (Task 9); `atomicWrite` (Task 4).
- Produces: `init({env?, ask?, log?}) → Promise<Server[]>`. Throws if already installed (inventory.yml present) or `skillDir` is a symlink.

- [ ] **Step 1: Write the failing test** — `test/init.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { init } from '../src/commands/init.js';

function tmpClaude() { return fs.mkdtempSync(path.join(os.tmpdir(), 'hops-cc-')); }

// Scripted ask: 'y' to add one server, fill it, then 'n' to stop.
function scriptedAsk(answers) { let i = 0; const a = async () => answers[i++]; a.close = () => {}; return a; }

test('init installs the skill and writes inventory + manual + command', async () => {
  const cc = tmpClaude();
  const ask = scriptedAsk(['y', 'web', '1.2.3.4', 'ubuntu', 'prod', 'nginx', 'Ubuntu 22.04', 'docker', 'ssh-key', 'n']);
  const servers = await init({ env: { CLAUDE_CONFIG_DIR: cc }, ask, log: () => {} });

  const skillDir = path.join(cc, 'skills', 'h-ops');
  assert.equal(servers.length, 1);
  assert.ok(fs.existsSync(path.join(skillDir, 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(cc, 'commands', 'h-ops.md')));
  const inv = YAML.parse(fs.readFileSync(path.join(skillDir, 'inventory.yml'), 'utf8'));
  assert.equal(inv.servers.web.host, '1.2.3.4');
  assert.deepEqual(inv.groups.all, ['web']);
  assert.ok(fs.existsSync(path.join(skillDir, 'servers', 'web.md')));
});

test('init refuses when already installed', async () => {
  const cc = tmpClaude();
  const skillDir = path.join(cc, 'skills', 'h-ops');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'inventory.yml'), 'servers: {}\n');
  const ask = scriptedAsk(['n']);
  await assert.rejects(() => init({ env: { CLAUDE_CONFIG_DIR: cc }, ask, log: () => {} }), /already installed/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/init.test.js`
Expected: FAIL (stub throws "not implemented").

- [ ] **Step 3: Implement** — `src/commands/init.js`

```js
import fs from 'node:fs';
import path from 'node:path';
import { getPaths, getPkgRoot } from '../lib/paths.js';
import { copyFramework } from '../lib/install.js';
import { renderInventory } from '../lib/inventory.js';
import { renderServerManual } from '../lib/manual.js';
import { renderSnippet } from '../lib/sshconfig.js';
import { promptServer } from '../lib/wizard.js';
import { atomicWrite } from '../lib/copy.js';

export async function init({ env = process.env, ask, log = console.log } = {}) {
  const { skillDir, commandPath } = getPaths(env);
  if (fs.existsSync(path.join(skillDir, 'inventory.yml'))) {
    throw new Error('h-ops already installed. Use `update` to refresh or `add-server` to add a server.');
  }
  if (fs.existsSync(skillDir) && fs.lstatSync(skillDir).isSymbolicLink()) {
    throw new Error('Dev install detected (symlink). Edit the repo directly.');
  }

  copyFramework({ pkgRoot: getPkgRoot(), skillDir, commandPath });
  log(`Installed h-ops skill → ${skillDir}`);

  const servers = [];
  if (ask) {
    for (;;) {
      const more = await ask(servers.length ? 'Add another server?' : 'Add a server now?', { choices: ['y', 'n'], default: 'y' });
      if (more !== 'y') break;
      servers.push(await promptServer(ask, { existingAliases: servers.map((s) => s.ssh_alias) }));
    }
  }

  if (servers.length) {
    atomicWrite(path.join(skillDir, 'inventory.yml'), renderInventory(servers));
    for (const s of servers) {
      atomicWrite(path.join(skillDir, 'servers', `${s.ssh_alias}.md`), renderServerManual(s));
    }
    log(`\nWrote inventory.yml with ${servers.length} server(s).`);
    log('\nSuggested ~/.ssh/config entries (add these yourself — not auto-edited):\n');
    for (const s of servers) log(renderSnippet(s) + '\n');
  } else {
    log('\nNo servers added. Copy inventory.example.yml → inventory.yml and edit it.');
  }
  log('Next: edit servers/*.md landmines, then run `npx h-ops-skill doctor`.');
  return servers;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/init.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/init.js test/init.test.js
git commit -m "feat(installer): init command (install + wizard)"
```

---

### Task 12: `add-server` command

**Files:**
- Modify: `src/commands/add-server.js` (replace Task 1 stub)
- Test: `test/add-server.test.js`

**Interfaces:**
- Consumes: `getPaths` (Task 2); `parseInventory`, `addServer` (Task 6); `renderServerManual` (Task 8); `renderSnippet` (Task 7); `promptServer` (Task 9); `atomicWrite` (Task 4).
- Produces: `addServer({env?, ask?, log?}) → Promise<Server>`. Throws if `inventory.yml` missing.

- [ ] **Step 1: Write the failing test** — `test/add-server.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { addServer } from '../src/commands/add-server.js';
import { renderInventory } from '../src/lib/inventory.js';

function scriptedAsk(answers) { let i = 0; const a = async () => answers[i++]; a.close = () => {}; return a; }

test('add-server appends to an existing inventory and writes a manual', async () => {
  const cc = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-cc-'));
  const skillDir = path.join(cc, 'skills', 'h-ops');
  fs.mkdirSync(path.join(skillDir, 'servers'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'inventory.yml'),
    renderInventory([{ ssh_alias: 'web', host: '1.1.1.1', user: 'ubuntu', role: 'prod', reverse_proxy: 'nginx', auth: 'ssh-key', tags: [] }]));

  const ask = scriptedAsk(['db', '2.2.2.2', 'root', 'dev', 'none', '', 'postgres', 'ssh-key']);
  const s = await addServer({ env: { CLAUDE_CONFIG_DIR: cc }, ask, log: () => {} });

  assert.equal(s.ssh_alias, 'db');
  const inv = YAML.parse(fs.readFileSync(path.join(skillDir, 'inventory.yml'), 'utf8'));
  assert.deepEqual(Object.keys(inv.servers), ['web', 'db']);
  assert.deepEqual(inv.groups.all, ['web', 'db']);
  assert.ok(fs.existsSync(path.join(skillDir, 'servers', 'db.md')));
});

test('add-server fails when inventory is missing', async () => {
  const cc = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-cc-'));
  const ask = scriptedAsk([]);
  await assert.rejects(() => addServer({ env: { CLAUDE_CONFIG_DIR: cc }, ask, log: () => {} }), /No inventory/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/add-server.test.js`
Expected: FAIL (stub throws "not implemented").

- [ ] **Step 3: Implement** — `src/commands/add-server.js`

```js
import fs from 'node:fs';
import path from 'node:path';
import { getPaths } from '../lib/paths.js';
import { parseInventory, addServer as addServerToText } from '../lib/inventory.js';
import { renderServerManual } from '../lib/manual.js';
import { renderSnippet } from '../lib/sshconfig.js';
import { promptServer } from '../lib/wizard.js';
import { atomicWrite } from '../lib/copy.js';

export async function addServer({ env = process.env, ask, log = console.log } = {}) {
  const { skillDir } = getPaths(env);
  const invPath = path.join(skillDir, 'inventory.yml');
  if (!fs.existsSync(invPath)) {
    throw new Error('No inventory.yml found. Run `npx h-ops-skill init` first.');
  }
  const text = fs.readFileSync(invPath, 'utf8');
  const existing = Object.keys(parseInventory(text).servers || {});
  const server = await promptServer(ask, { existingAliases: existing });

  atomicWrite(invPath, addServerToText(text, server));
  atomicWrite(path.join(skillDir, 'servers', `${server.ssh_alias}.md`), renderServerManual(server));

  log(`Added ${server.ssh_alias} to inventory.`);
  log('\nSuggested ~/.ssh/config entry (add it yourself):\n');
  log(renderSnippet(server));
  return server;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/add-server.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/add-server.js test/add-server.test.js
git commit -m "feat(installer): add-server command"
```

---

### Task 13: `doctor` command

**Files:**
- Modify: `src/commands/doctor.js` (replace Task 1 stub)
- Test: `test/doctor.test.js`

**Interfaces:**
- Consumes: `getPaths` (Task 2); `parseInventory` (Task 6); `readHosts` (Task 7).
- Produces: `doctor({env?, log?, connect?, sshConfigPath?}) → { ok: boolean, checks: {ok, label}[] }`.

- [ ] **Step 1: Write the failing test** — `test/doctor.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { doctor } from '../src/commands/doctor.js';
import { renderInventory } from '../src/lib/inventory.js';

test('doctor flags an ssh alias missing from ssh config', () => {
  const cc = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-cc-'));
  const skillDir = path.join(cc, 'skills', 'h-ops');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'x');
  fs.writeFileSync(path.join(skillDir, 'inventory.yml'), renderInventory([
    { ssh_alias: 'web', host: '1.1.1.1', user: 'u', role: 'prod', reverse_proxy: 'none', auth: 'ssh-key', tags: [] },
    { ssh_alias: 'db', host: '2.2.2.2', user: 'u', role: 'dev', reverse_proxy: 'none', auth: 'ssh-key', tags: [] },
  ]));
  const sshCfg = path.join(cc, 'ssh_config');
  fs.writeFileSync(sshCfg, 'Host web\n    HostName 1.1.1.1\n');

  const r = doctor({ env: { CLAUDE_CONFIG_DIR: cc }, log: () => {}, sshConfigPath: sshCfg });
  const byLabel = Object.fromEntries(r.checks.map((c) => [c.label, c.ok]));
  assert.equal(byLabel['~/.ssh/config has Host web'], true);
  assert.equal(byLabel['~/.ssh/config has Host db'], false);
  assert.equal(r.ok, false); // at least the missing alias fails
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/doctor.test.js`
Expected: FAIL (stub returns `{ ok:false, checks:[] }` → label lookups are `undefined`).

- [ ] **Step 3: Implement** — `src/commands/doctor.js`

```js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getPaths } from '../lib/paths.js';
import { parseInventory } from '../lib/inventory.js';
import { readHosts } from '../lib/sshconfig.js';

function which(cmd) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(finder, [cmd], { stdio: 'ignore' }).status === 0;
}

export function doctor({ env = process.env, log = console.log, connect = false, sshConfigPath = path.join(os.homedir(), '.ssh', 'config') } = {}) {
  const checks = [];
  const add = (ok, label) => { checks.push({ ok, label }); log(`${ok ? '✓' : '✗'} ${label}`); };

  for (const tool of ['ssh', 'bash', 'column', 'openssl']) add(which(tool), `tool: ${tool}`);
  add(which('rsync'), 'tool: rsync (needed only for deploy)');

  const { skillDir, commandPath } = getPaths(env);
  add(fs.existsSync(path.join(skillDir, 'SKILL.md')), `skill installed (${skillDir})`);
  add(fs.existsSync(commandPath), `command installed (${commandPath})`);

  const invPath = path.join(skillDir, 'inventory.yml');
  let servers = {};
  if (fs.existsSync(invPath)) {
    try {
      servers = parseInventory(fs.readFileSync(invPath, 'utf8')).servers || {};
      add(true, `inventory.yml parses (${Object.keys(servers).length} servers)`);
    } catch (e) {
      add(false, `inventory.yml parse error: ${e.message}`);
    }
  } else {
    add(false, 'inventory.yml present');
  }

  const hosts = readHosts(sshConfigPath);
  for (const [name, s] of Object.entries(servers)) {
    const alias = (s && s.ssh_alias) || name;
    add(hosts.includes(alias), `~/.ssh/config has Host ${alias}`);
    if (connect) {
      const r = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', alias, 'true'], { stdio: 'ignore' });
      add(r.status === 0, `ssh ${alias} reachable`);
    }
  }

  const failed = checks.filter((c) => !c.ok).length;
  log(`\n${checks.length - failed}/${checks.length} checks passed.`);
  return { ok: failed === 0, checks };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/doctor.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/doctor.js test/doctor.test.js
git commit -m "feat(installer): doctor command (env + ssh config checks)"
```

---

### Task 14: `uninstall` command

**Files:**
- Modify: `src/commands/uninstall.js` (replace Task 1 stub)
- Test: `test/uninstall.test.js`

**Interfaces:**
- Consumes: `getPaths` (Task 2); `SKILL_FILES` (Task 3).
- Produces: `uninstall({env?, ask?, log?, purge?, yes?}) → Promise<void>`. Symlink installs are only unlinked (never recurse-deleted).

- [ ] **Step 1: Write the failing test** — `test/uninstall.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { uninstall } from '../src/commands/uninstall.js';

function noAsk() { const a = async () => 'n'; a.close = () => {}; return a; }

test('uninstall on a symlink only unlinks (repo survives)', async () => {
  const cc = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-cc-'));
  const skillDir = path.join(cc, 'skills', 'h-ops');
  fs.mkdirSync(path.dirname(skillDir), { recursive: true });
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-repo-'));
  fs.writeFileSync(path.join(repo, 'SKILL.md'), 'keep me');
  fs.symlinkSync(repo, skillDir);

  await uninstall({ env: { CLAUDE_CONFIG_DIR: cc }, ask: noAsk(), log: () => {} });

  assert.equal(fs.existsSync(skillDir), false);
  assert.ok(fs.existsSync(path.join(repo, 'SKILL.md')), 'repo target untouched');
});

test('uninstall keeps user data by default', async () => {
  const cc = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-cc-'));
  const skillDir = path.join(cc, 'skills', 'h-ops');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'x');
  fs.writeFileSync(path.join(skillDir, 'inventory.yml'), 'servers: {}\n');

  await uninstall({ env: { CLAUDE_CONFIG_DIR: cc }, ask: noAsk(), log: () => {}, yes: true });

  assert.equal(fs.existsSync(path.join(skillDir, 'SKILL.md')), false);
  assert.ok(fs.existsSync(path.join(skillDir, 'inventory.yml')), 'user data preserved');
});

test('uninstall --purge removes everything', async () => {
  const cc = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-cc-'));
  const skillDir = path.join(cc, 'skills', 'h-ops');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'inventory.yml'), 'servers: {}\n');

  await uninstall({ env: { CLAUDE_CONFIG_DIR: cc }, ask: noAsk(), log: () => {}, purge: true });

  assert.equal(fs.existsSync(skillDir), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/uninstall.test.js`
Expected: FAIL (stub throws "not implemented").

- [ ] **Step 3: Implement** — `src/commands/uninstall.js`

```js
import fs from 'node:fs';
import path from 'node:path';
import { getPaths } from '../lib/paths.js';
import { SKILL_FILES } from '../lib/manifest.js';

function removeFrameworkOnly(skillDir) {
  for (const f of SKILL_FILES) {
    const p = path.join(skillDir, f.path);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  const scriptsDir = path.join(skillDir, 'scripts');
  try { if (fs.readdirSync(scriptsDir).length === 0) fs.rmdirSync(scriptsDir); } catch {}
}

export async function uninstall({ env = process.env, ask, log = console.log, purge = false, yes = false } = {}) {
  const { skillDir, commandPath } = getPaths(env);

  if (!fs.existsSync(skillDir) && !fs.existsSync(commandPath)) {
    log('h-ops is not installed.');
    return;
  }

  // Symlink (dev) install: only unlink, never recurse-delete the target repo.
  if (fs.existsSync(skillDir) && fs.lstatSync(skillDir).isSymbolicLink()) {
    fs.unlinkSync(skillDir);
    if (fs.existsSync(commandPath)) fs.unlinkSync(commandPath);
    log('Removed symlinked install (repo left intact).');
    return;
  }

  if (fs.existsSync(commandPath)) fs.unlinkSync(commandPath);

  let removeAll = purge;
  if (!removeAll && !yes && ask) {
    const a = await ask('Also delete your fleet data (inventory.yml, servers/*.md, deploy-playbooks.md)?', { choices: ['y', 'n'], default: 'n' });
    removeAll = a === 'y';
  }

  if (removeAll) {
    fs.rmSync(skillDir, { recursive: true, force: true });
    log('Removed h-ops skill and all fleet data.');
  } else {
    removeFrameworkOnly(skillDir);
    log(`Removed framework files. Your fleet data remains in ${skillDir}.`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/uninstall.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/uninstall.js test/uninstall.test.js
git commit -m "feat(installer): uninstall command (symlink-safe)"
```

---

### Task 15: Full-suite green + README docs

**Files:**
- Modify: `README.md` (Install + Sub-commands sections)

**Interfaces:**
- Consumes: all prior tasks.
- Produces: passing full suite; README documenting npx usage.

- [ ] **Step 1: Run the full test suite**

Run: `node --test`
Expected: PASS — all test files green (cli, paths, manifest, copy, install, inventory, sshconfig, manual, prompt, wizard, update, init, add-server, doctor, uninstall).

- [ ] **Step 2: Manual end-to-end smoke (temp config dir)**

Run:
```bash
TMP=$(mktemp -d)
CLAUDE_CONFIG_DIR="$TMP" node bin/cli.js doctor
echo "exit: $?"
ls -R "$TMP" 2>/dev/null || true
```
Expected: doctor runs, reports skill NOT installed (exit 1), prints a checklist. No crash.

- [ ] **Step 3: Update `README.md` — replace the "Install (manual, for now)" section**

Replace the current Install block (the `git clone` + `ln -s` fenced block and the "An `npx` installer is planned" line) with:

````markdown
## Install

```bash
npx h-ops-skill init
```

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
````

- [ ] **Step 4: Update README Requirements note**

In the "Requirements" section, add a first bullet:

```markdown
- Node.js ≥ 18 (only for the `npx` installer; the skill itself is pure bash/ssh).
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document npx installer in README"
```

---

## Self-Review

**Spec coverage:**
- npm packaging + `files` whitelist → Task 1. ✓
- paths/CLAUDE_CONFIG_DIR → Task 2. ✓
- framework vs user-data classification → Task 3. ✓
- copy + atomic write → Task 4; copyFramework → Task 5. ✓
- inventory render/parse/addServer (yaml, comment-preserving) → Task 6. ✓
- ssh config parse + snippet (print-only) → Task 7. ✓
- server manual template → Task 8. ✓
- prompt + wizard → Task 9. ✓
- `update` (framework-only, symlink-guard) → Task 10. ✓
- `init` (wizard, refuse-if-installed, symlink-guard) → Task 11. ✓
- `add-server` → Task 12. ✓
- `doctor` (deps, install, ssh alias match, `--connect`) → Task 13. ✓
- `uninstall` (symlink-safe, keep-data default, `--purge`) → Task 14. ✓
- error handling/exit codes (cli try/catch) → Task 1 + Task 15 smoke. ✓
- README docs → Task 15. ✓
- `npm publish` → explicitly out of scope (spec follow-up). Noted, no task.

**Placeholder scan:** No TBD/TODO; every code step contains full source. ✓

**Type consistency:** Server shape `{ ssh_alias, host, user, role, reverse_proxy, auth, os?, tags?, notes_file }` is consistent across `promptServer` (Task 9), `renderInventory`/`addServer` (Task 6), `renderServerManual` (Task 8), `renderSnippet` (Task 7). Command signatures `({env, ask, log, ...})` consistent across Tasks 10–14 and `bin/cli.js` (Task 1). `copyFramework({pkgRoot, skillDir, commandPath})` consistent between Task 5 and its callers (Tasks 10, 11). `doctor` returns `{ ok, checks }` consistent between Task 13 and `bin/cli.js`. ✓
