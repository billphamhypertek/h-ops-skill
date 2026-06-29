import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

const MARKERS = [
  '[META]', '[CONTAINERS]', '[NETWORK.LISTENING]', '[NETWORK.FIREWALL]',
  '[ACCESS.SHELL_USERS]', '[ACCESS.SUDO]', '[ACCESS.AUTHORIZED_KEYS]', '[ACCESS.SSHD]',
  '[SYSTEM.KERNEL]', '[SYSTEM.PACKAGES_SECURITY]', '[SYSTEM.PACKAGES_ALL_HASH]',
  '[SYSTEM.CRON]', '[SYSTEM.TIMERS]', '[SYSTEM.CONFIG_CHECKSUMS]', '[END]',
];

test('every snapshot grammar marker is both emitted and documented', () => {
  const script = fs.readFileSync(root + 'scripts/snapshot.sh', 'utf8');
  const docs = fs.readFileSync(root + 'references/operations.md', 'utf8');
  for (const m of MARKERS) {
    assert.ok(script.includes(m), `snapshot.sh must emit ${m}`);
    assert.ok(docs.includes(m), `operations.md must document ${m}`);
  }
});

test('operations.md documents accept --only sections and the exit-code convention', () => {
  const docs = fs.readFileSync(root + 'references/operations.md', 'utf8');
  for (const section of ['containers', 'network', 'access', 'system']) {
    assert.ok(docs.includes(section), `operations.md must mention the ${section} section`);
  }
  assert.match(docs, /DRIFT:2/);
  assert.match(docs, /DRIFT:1/);
  assert.match(docs, /DRIFT:0/);
});
