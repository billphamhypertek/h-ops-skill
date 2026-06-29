import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function getPaths(env = process.env) {
  const claudeDir = env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const skillDir = path.join(claudeDir, 'skills', 'h-ops');
  const commandsDir = path.join(claudeDir, 'commands');
  const commandPath = path.join(commandsDir, 'h-ops.md');
  return { claudeDir, skillDir, commandsDir, commandPath };
}

// src/lib/paths.js → up two levels = package root
export function getPkgRoot() {
  return fileURLToPath(new URL('../../', import.meta.url));
}
