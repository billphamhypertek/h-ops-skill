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
