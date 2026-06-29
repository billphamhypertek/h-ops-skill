#!/usr/bin/env node
import { init } from '../src/commands/init.js';
import { update } from '../src/commands/update.js';
import { doctor } from '../src/commands/doctor.js';
import { uninstall } from '../src/commands/uninstall.js';
import { addServer } from '../src/commands/add-server.js';
import { createAsk } from '../src/lib/prompt.js';

const USAGE = `h-ops-skill — installer for the h-ops Claude Code skill

Usage:
  npx h-ops-skill <command> [options]

Commands:
  init          Install the skill and configure your fleet (interactive wizard)
  update        Refresh framework files only (keeps your fleet data)
  add-server    Add one server to an existing inventory
  doctor        Check environment, install, and ssh config   [--connect]
  uninstall     Remove the skill                              [--purge] [--yes]
`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    process.stdout.write(USAGE);
    return;
  }
  if (cmd === 'update') { update({}); return; }
  if (cmd === 'doctor') {
    const r = doctor({ connect: flags.has('--connect') });
    if (!r.ok) process.exitCode = 1;
    return;
  }
  const ask = createAsk();
  try {
    if (cmd === 'init') await init({ ask });
    else if (cmd === 'add-server') await addServer({ ask });
    else if (cmd === 'uninstall') await uninstall({ ask, purge: flags.has('--purge'), yes: flags.has('--yes') });
    else { process.stdout.write(`Unknown command: ${cmd}\n\n${USAGE}`); process.exitCode = 1; }
  } finally {
    ask.close();
  }
}

main().catch((e) => { process.stderr.write(`Error: ${e.message}\n`); process.exitCode = 1; });
