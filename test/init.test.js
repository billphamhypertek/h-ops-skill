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
