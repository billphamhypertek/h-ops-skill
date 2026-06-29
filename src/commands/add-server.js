import fs from 'node:fs';
import path from 'node:path';
import { getPaths } from '../lib/paths.js';
import { parseInventory, addServer as addServerToText } from '../lib/inventory.js';
import { renderServerManual } from '../lib/manual.js';
import { renderSnippet } from '../lib/sshconfig.js';
import { promptServer } from '../lib/wizard.js';
import { atomicWrite } from '../lib/copy.js';

export async function addServer({ env = process.env, ask, log = console.log } = {}) {
  const { skillDir } = getPaths(env);
  const invPath = path.join(skillDir, 'inventory.yml');
  if (!fs.existsSync(invPath)) {
    throw new Error('No inventory.yml found. Run `npx h-ops-skill init` first.');
  }
  const text = fs.readFileSync(invPath, 'utf8');
  const existing = Object.keys(parseInventory(text).servers || {});
  const server = await promptServer(ask, { existingAliases: existing });

  atomicWrite(invPath, addServerToText(text, server));
  atomicWrite(path.join(skillDir, 'servers', `${server.ssh_alias}.md`), renderServerManual(server));

  log(`Added ${server.ssh_alias} to inventory.`);
  log('\nSuggested ~/.ssh/config entry (add it yourself):\n');
  log(renderSnippet(server));
  return server;
}
