import fs from 'node:fs';
import path from 'node:path';
import { getPaths } from '../lib/paths.js';
import { parseInventory, addServer as addServerToText, renderInventory } from '../lib/inventory.js';
import { renderServerManual } from '../lib/manual.js';
import { renderSnippet } from '../lib/sshconfig.js';
import { promptServer } from '../lib/wizard.js';
import { atomicWrite } from '../lib/copy.js';

export async function addServer({ env = process.env, ask, log = console.log } = {}) {
  const { skillDir } = getPaths(env);
  const invPath = path.join(skillDir, 'inventory.yml');
  const hasInventory = fs.existsSync(invPath);
  // The skill is installed once SKILL.md is present. A `init` that added zero servers leaves the
  // skill installed but writes no inventory.yml — in that case bootstrap a fresh one here instead
  // of sending the user back to `init` (which would now refuse as "already installed").
  const installed = fs.existsSync(path.join(skillDir, 'SKILL.md'));
  if (!hasInventory && !installed) {
    throw new Error('No inventory.yml found. Run `npx h-ops-skill init` first.');
  }

  const text = hasInventory ? fs.readFileSync(invPath, 'utf8') : '';
  const existing = hasInventory ? Object.keys(parseInventory(text).servers || {}) : [];
  const server = await promptServer(ask, { existingAliases: existing });

  const nextText = hasInventory ? addServerToText(text, server) : renderInventory([server]);
  atomicWrite(invPath, nextText);
  atomicWrite(path.join(skillDir, 'servers', `${server.ssh_alias}.md`), renderServerManual(server));

  log(`Added ${server.ssh_alias} to inventory.`);
  log('\nSuggested ~/.ssh/config entry (add it yourself):\n');
  log(renderSnippet(server));
  return server;
}
