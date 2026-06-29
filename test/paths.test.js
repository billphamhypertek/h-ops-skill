import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getPaths, getPkgRoot } from '../src/lib/paths.js';

test('getPaths honors CLAUDE_CONFIG_DIR', () => {
  const p = getPaths({ CLAUDE_CONFIG_DIR: '/tmp/cc' });
  assert.equal(p.claudeDir, '/tmp/cc');
  assert.equal(p.skillDir, path.join('/tmp/cc', 'skills', 'h-ops'));
  assert.equal(p.commandPath, path.join('/tmp/cc', 'commands', 'h-ops.md'));
});

test('getPaths falls back to ~/.claude', () => {
  const p = getPaths({});
  assert.match(p.claudeDir, /\.claude$/);
});

test('getPkgRoot points at the package root', () => {
  assert.ok(fs.existsSync(path.join(getPkgRoot(), 'package.json')));
});
