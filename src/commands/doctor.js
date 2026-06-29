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
