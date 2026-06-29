import fs from 'node:fs';
import path from 'node:path';
import { getPaths, getPkgRoot } from '../lib/paths.js';
import { copyFramework } from '../lib/install.js';
import { renderInventory } from '../lib/inventory.js';
import { renderServerManual } from '../lib/manual.js';
import { renderSnippet } from '../lib/sshconfig.js';
import { promptServer } from '../lib/wizard.js';
import { atomicWrite } from '../lib/copy.js';

export async function init({ env = process.env, ask, log = console.log } = {}) {
  const { skillDir, commandPath } = getPaths(env);
  if (fs.existsSync(path.join(skillDir, 'inventory.yml'))) {
    throw new Error('h-ops already installed. Use `update` to refresh or `add-server` to add a server.');
  }
  if (fs.existsSync(skillDir) && fs.lstatSync(skillDir).isSymbolicLink()) {
    throw new Error('Dev install detected (symlink). Edit the repo directly.');
  }

  copyFramework({ pkgRoot: getPkgRoot(), skillDir, commandPath });
  log(`Installed h-ops skill → ${skillDir}`);

  const servers = [];
  if (ask) {
    for (;;) {
      const more = await ask(servers.length ? 'Add another server?' : 'Add a server now?', { choices: ['y', 'n'], default: 'y' });
      if (more !== 'y') break;
      servers.push(await promptServer(ask, { existingAliases: servers.map((s) => s.ssh_alias) }));
    }
  }

  if (servers.length) {
    atomicWrite(path.join(skillDir, 'inventory.yml'), renderInventory(servers));
    for (const s of servers) {
      atomicWrite(path.join(skillDir, 'servers', `${s.ssh_alias}.md`), renderServerManual(s));
    }
    log(`\nWrote inventory.yml with ${servers.length} server(s).`);
    log('\nSuggested ~/.ssh/config entries (add these yourself — not auto-edited):\n');
    for (const s of servers) log(renderSnippet(s) + '\n');
  } else {
    log('\nNo servers added. Copy inventory.example.yml → inventory.yml and edit it.');
  }
  log('Next: edit servers/*.md landmines, then run `npx h-ops-skill doctor`.');
  return servers;
}
