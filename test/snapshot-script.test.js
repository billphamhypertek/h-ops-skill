import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const SNAP = fileURLToPath(new URL('../scripts/snapshot.sh', import.meta.url));

const MARKERS = [
  '[META]', '[CONTAINERS]', '[NETWORK.LISTENING]', '[NETWORK.FIREWALL]',
  '[ACCESS.SHELL_USERS]', '[ACCESS.SUDO]', '[ACCESS.AUTHORIZED_KEYS]', '[ACCESS.SSHD]',
  '[SYSTEM.KERNEL]', '[SYSTEM.PACKAGES_SECURITY]', '[SYSTEM.PACKAGES_ALL_HASH]',
  '[SYSTEM.CRON]', '[SYSTEM.TIMERS]', '[SYSTEM.CONFIG_CHECKSUMS]', '[END]',
];

test('snapshot.sh exits 2 with usage when given no args', () => {
  const r = spawnSync('bash', [SNAP], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage:/);
});

test('snapshot.sh passes bash -n (outer script syntax)', () => {
  const r = spawnSync('bash', ['-n', SNAP], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('the remote heredoc block is valid bash', () => {
  const src = fs.readFileSync(SNAP, 'utf8');
  const m = src.match(/<<'EOF'[^\n]*\n([\s\S]*?)\nEOF/);
  assert.ok(m, 'a quoted EOF heredoc is present');
  const r = spawnSync('bash', ['-n'], { input: m[1], encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('snapshot.sh emits every documented section marker', () => {
  const src = fs.readFileSync(SNAP, 'utf8');
  for (const marker of MARKERS) {
    assert.ok(src.includes(marker), `script must emit ${marker}`);
  }
});
