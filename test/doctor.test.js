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

test('doctor reports state/ as a non-fatal check', () => {
  const cc = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-cc-'));
  const skillDir = path.join(cc, 'skills', 'h-ops');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'x');
  const sshCfg = path.join(cc, 'ssh_config');
  fs.writeFileSync(sshCfg, '');

  const r = doctor({ env: { CLAUDE_CONFIG_DIR: cc }, log: () => {}, sshConfigPath: sshCfg });
  const stateCheck = r.checks.find((c) => /state\//.test(c.label));
  assert.ok(stateCheck, 'a state/ check is present');
  assert.equal(stateCheck.fatal, false);
});

test('doctor sees an existing writable state/ dir', () => {
  const cc = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-cc-'));
  const skillDir = path.join(cc, 'skills', 'h-ops');
  fs.mkdirSync(path.join(skillDir, 'state'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'x');
  const sshCfg = path.join(cc, 'ssh_config');
  fs.writeFileSync(sshCfg, '');

  const r = doctor({ env: { CLAUDE_CONFIG_DIR: cc }, log: () => {}, sshConfigPath: sshCfg });
  const stateCheck = r.checks.find((c) => /state\//.test(c.label));
  assert.equal(stateCheck.ok, true);
  assert.match(stateCheck.label, /writable/);
});

test('doctor reports a non-writable state/ as advisory (does not flip the verdict)', (t) => {
  const cc = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-cc-'));
  const skillDir = path.join(cc, 'skills', 'h-ops');
  fs.mkdirSync(path.join(skillDir, 'state'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'x');
  const sshCfg = path.join(cc, 'ssh_config');
  fs.writeFileSync(sshCfg, '');

  // Force the "exists but NOT writable" branch deterministically — chmod 0o500
  // is bypassed by root, so a root CI runner would give a false green.
  t.mock.method(fs, 'accessSync', () => {
    throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
  });

  const r = doctor({ env: { CLAUDE_CONFIG_DIR: cc }, log: () => {}, sshConfigPath: sshCfg });
  const stateCheck = r.checks.find((c) => /state\//.test(c.label));
  assert.ok(stateCheck, 'a state/ check is present');
  assert.equal(stateCheck.ok, false);
  assert.equal(stateCheck.fatal, false);
  assert.match(stateCheck.label, /NOT writable/);
  // advisory-only: the verdict is derived solely from fatal checks, so a
  // non-writable state/ can never flip it.
  assert.equal(r.ok, r.checks.filter((c) => c.fatal && !c.ok).length === 0);
});

test('doctor summary counts required checks and surfaces advisories separately', (t) => {
  const cc = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-cc-'));
  const skillDir = path.join(cc, 'skills', 'h-ops');
  fs.mkdirSync(path.join(skillDir, 'state'), { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'x');
  const sshCfg = path.join(cc, 'ssh_config');
  fs.writeFileSync(sshCfg, '');

  t.mock.method(fs, 'accessSync', () => {
    throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
  });

  const logs = [];
  const r = doctor({ env: { CLAUDE_CONFIG_DIR: cc }, log: (s) => logs.push(s), sshConfigPath: sshCfg });

  const summary = logs.find((l) => /checks passed/.test(l));
  assert.ok(summary, 'a summary line is logged');
  assert.match(summary, /required checks passed/);
  // exactly one non-fatal failure exists (the non-writable state/), surfaced separately, singular
  assert.match(summary, /\(1 advisory warning\)/);

  const m = summary.match(/(\d+)\/(\d+) required checks passed/);
  assert.ok(m, 'summary headline is "N/M required checks passed"');
  const [, passedStr, totalStr] = m;
  // denominator is the count of REQUIRED (fatal) checks — the advisory is excluded
  assert.equal(Number(totalStr), r.checks.filter((c) => c.fatal).length);
  assert.equal(Number(passedStr), r.checks.filter((c) => c.fatal && c.ok).length);
  // verdict agrees with the displayed ratio (the contradiction is gone)
  assert.equal(r.ok, Number(passedStr) === Number(totalStr));
});
