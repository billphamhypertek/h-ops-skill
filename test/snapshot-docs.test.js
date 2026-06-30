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

  // the accept command documents the --only <section> form
  assert.ok(docs.includes('--only <section>'),
    'operations.md must document the accept --only <section> form');

  // the documented --only section set, parsed from the `section` ∈ {...} enumeration
  const onlyMatch = docs.match(/`section`[^{]*\{([^}]+)\}/);
  assert.ok(onlyMatch, 'accept --only must enumerate its sections as `section` ∈ {...}');
  const onlySections = (onlyMatch[1].match(/`([^`]+)`/g) || []).map((t) => t.replace(/`/g, ''));

  // the State JSON schema block's top-level keys, minus metadata
  const jsonMatch = docs.match(/```json\n([\s\S]*?)\n```/);
  assert.ok(jsonMatch, 'a fenced ```json State schema block must be present');
  const schemaSections = Object.keys(JSON.parse(jsonMatch[1]))
    .filter((k) => k !== 'server' && k !== 'captured_at');

  // the real invariant: documented --only sections === schema's top-level sections
  assert.deepEqual([...onlySections].sort(), [...schemaSections].sort());

  assert.match(docs, /DRIFT:2/);
  assert.match(docs, /DRIFT:1/);
  assert.match(docs, /DRIFT:0/);
});
