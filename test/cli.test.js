import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

test('--help prints usage and exits 0', () => {
  const r = spawnSync('node', [CLI, '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:\s+npx h-ops-skill/);
  assert.match(r.stdout, /init\b/);
  assert.match(r.stdout, /uninstall\b/);
});

test('unknown command exits 1', () => {
  const r = spawnSync('node', [CLI, 'bogus'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /Unknown command/);
});
