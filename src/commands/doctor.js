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
  const add = (ok, label, { fatal = true } = {}) => {
    checks.push({ ok, label, fatal });
    log(`${ok ? '✓' : fatal ? '✗' : '•'} ${label}`);
  };

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

  const stateDir = path.join(skillDir, 'state');
  if (fs.existsSync(stateDir)) {
    let writable = true;
    try { fs.accessSync(stateDir, fs.constants.W_OK); } catch { writable = false; }
    add(writable,
      writable ? `state/ writable (${stateDir})` : `state/ exists but is NOT writable (${stateDir})`,
      { fatal: false });
  } else {
    add(true, 'state/ not created yet — created on first snapshot', { fatal: false });
  }

  const requiredTotal = checks.filter((c) => c.fatal).length;
  const requiredPassed = checks.filter((c) => c.fatal && c.ok).length;
  const advisories = checks.filter((c) => !c.fatal && !c.ok).length;
  const advisoryNote = advisories
    ? ` (${advisories} advisory warning${advisories === 1 ? '' : 's'})`
    : '';
  log(`\n${requiredPassed}/${requiredTotal} required checks passed${advisoryNote}.`);
  return { ok: requiredPassed === requiredTotal, checks };
}
