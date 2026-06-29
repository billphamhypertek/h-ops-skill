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
