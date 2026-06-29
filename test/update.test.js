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
  fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
  fs.mkdirSync(path.join(skillDir, 'servers'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'references/deploy-playbooks.md'), 'MY PLAYBOOK');
  fs.writeFileSync(path.join(skillDir, 'servers/web.md'), 'MY MANUAL');

  update({ env: { CLAUDE_CONFIG_DIR: cc }, log: () => {} });

  assert.notEqual(fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8'), 'OLD');
  assert.match(fs.readFileSync(path.join(skillDir, 'inventory.yml'), 'utf8'), /keep/);
  assert.equal(fs.readFileSync(path.join(skillDir, 'references/deploy-playbooks.md'), 'utf8'), 'MY PLAYBOOK');
  assert.equal(fs.readFileSync(path.join(skillDir, 'servers/web.md'), 'utf8'), 'MY MANUAL');
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

test('update preserves the state/ directory (drift baselines)', () => {
  const cc = tmpClaude();
  const skillDir = path.join(cc, 'skills', 'h-ops');
  fs.mkdirSync(path.join(skillDir, 'state'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'OLD');
  fs.writeFileSync(path.join(skillDir, 'state', 'web.baseline.json'), '{"server":"web"}');

  update({ env: { CLAUDE_CONFIG_DIR: cc }, log: () => {} });

  assert.equal(fs.readFileSync(path.join(skillDir, 'state', 'web.baseline.json'), 'utf8'), '{"server":"web"}');
  assert.notEqual(fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8'), 'OLD');
});
