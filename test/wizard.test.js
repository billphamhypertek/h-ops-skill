import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promptServer } from '../src/lib/wizard.js';

// Scripted ask: returns queued answers in order, ignoring validation.
function scriptedAsk(answers) {
  let i = 0;
  return async () => answers[i++];
}

test('promptServer maps answers to a Server object', async () => {
  const ask = scriptedAsk(['web', '1.2.3.4', 'ubuntu', 'prod', 'nginx', 'Ubuntu 22.04', 'docker, web', 'ssh-key']);
  const s = await promptServer(ask, { existingAliases: [] });
  assert.equal(s.ssh_alias, 'web');
  assert.equal(s.host, '1.2.3.4');
  assert.equal(s.role, 'prod');
  assert.deepEqual(s.tags, ['docker', 'web']);
  assert.equal(s.auth, 'ssh-key');
  assert.equal(s.notes_file, 'servers/web.md');
});

test('promptServer leaves os undefined when blank', async () => {
  const ask = scriptedAsk(['db', '1.1.1.1', 'root', 'dev', 'none', '', '', 'ssh-key']);
  const s = await promptServer(ask, {});
  assert.equal(s.os, undefined);
  assert.deepEqual(s.tags, []);
});
