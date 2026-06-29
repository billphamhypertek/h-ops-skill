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

test('uninstall (keep data) drops emptied framework dirs but keeps dirs holding user data', async () => {
  const cc = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-cc-'));
  const skillDir = path.join(cc, 'skills', 'h-ops');
  fs.mkdirSync(path.join(skillDir, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
  fs.mkdirSync(path.join(skillDir, 'servers'), { recursive: true });

  // framework payload
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'x');
  fs.writeFileSync(path.join(skillDir, 'scripts', 'overview.sh'), '#');
  fs.writeFileSync(path.join(skillDir, 'references', 'operations.md'), 'x');
  fs.writeFileSync(path.join(skillDir, 'references', 'deploy-playbooks.example.md'), 'x');
  fs.writeFileSync(path.join(skillDir, 'servers', '_example.md'), 'x');
  // user data
  fs.writeFileSync(path.join(skillDir, 'inventory.yml'), 'servers: {}\n');
  fs.writeFileSync(path.join(skillDir, 'servers', 'web.md'), 'mine');
  fs.writeFileSync(path.join(skillDir, 'references', 'deploy-playbooks.md'), 'mine');

  await uninstall({ env: { CLAUDE_CONFIG_DIR: cc }, ask: noAsk(), log: () => {}, yes: true });

  assert.equal(fs.existsSync(path.join(skillDir, 'scripts')), false, 'emptied scripts/ removed');
  assert.ok(fs.existsSync(path.join(skillDir, 'servers', 'web.md')), 'user manual kept');
  assert.ok(fs.existsSync(path.join(skillDir, 'references', 'deploy-playbooks.md')), 'user playbook kept');
  assert.ok(fs.existsSync(path.join(skillDir, 'inventory.yml')), 'inventory kept');
});

test('uninstall --purge removes everything', async () => {
  const cc = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-cc-'));
  const skillDir = path.join(cc, 'skills', 'h-ops');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'inventory.yml'), 'servers: {}\n');

  await uninstall({ env: { CLAUDE_CONFIG_DIR: cc }, ask: noAsk(), log: () => {}, purge: true });

  assert.equal(fs.existsSync(skillDir), false);
});
