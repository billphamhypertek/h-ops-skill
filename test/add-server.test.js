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
