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
