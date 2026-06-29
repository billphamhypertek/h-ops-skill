import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copyFramework } from '../src/lib/install.js';
import { getPkgRoot } from '../src/lib/paths.js';

test('copyFramework installs SKILL.md, executable scripts, and the command', () => {
  const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-skill-'));
  const commandPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hops-cmd-')), 'h-ops.md');
  const written = copyFramework({ pkgRoot: getPkgRoot(), skillDir, commandPath });

  assert.ok(fs.existsSync(path.join(skillDir, 'SKILL.md')));
  assert.ok(fs.statSync(path.join(skillDir, 'scripts/overview.sh')).mode & 0o100);
  assert.ok(fs.existsSync(commandPath));
  assert.ok(written.includes('SKILL.md'));
  assert.ok(written.includes('commands/h-ops.md'));
});
