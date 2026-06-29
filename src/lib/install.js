import path from 'node:path';
import { SKILL_FILES, COMMAND_SRC } from './manifest.js';
import { copyFileTo } from './copy.js';

export function copyFramework({ pkgRoot, skillDir, commandPath }) {
  const written = [];
  for (const f of SKILL_FILES) {
    copyFileTo(path.join(pkgRoot, f.path), path.join(skillDir, f.path), { exec: f.exec });
    written.push(f.path);
  }
  copyFileTo(path.join(pkgRoot, COMMAND_SRC), commandPath);
  written.push(COMMAND_SRC);
  return written;
}
