import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { promptServer } from '../src/lib/wizard.js';
import { createAsk } from '../src/lib/prompt.js';

// Scripted ask: returns queued answers in order, ignoring validation.
function scriptedAsk(answers) {
  let i = 0;
  return async () => answers[i++];
}

function sink() { return new Writable({ write(_c, _e, cb) { cb(); } }); }

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

// Regression: a real createAsk fed all answers up-front (the piped/non-interactive case) must not
// drop any line. Before the line-queue fix, readline emitted buffered 'line' events between
// questions with no awaiter, swallowing answers and leaving fields blank.
test('promptServer over a real createAsk does not drop fully-buffered (piped) input', async () => {
  const input = new PassThrough();
  // All 8 answers written before promptServer registers any question — exactly the pipe scenario.
  input.write('web\n1.2.3.4\nubuntu\nprod\nnginx\nUbuntu 22.04\ndocker, web\nssh-key\n');
  const ask = createAsk({ input, output: sink() });

  const s = await promptServer(ask, { existingAliases: [] });
  ask.close();

  assert.equal(s.ssh_alias, 'web');
  assert.equal(s.host, '1.2.3.4');
  assert.equal(s.user, 'ubuntu');
  assert.equal(s.role, 'prod');
  assert.equal(s.reverse_proxy, 'nginx');
  assert.equal(s.os, 'Ubuntu 22.04');
  assert.deepEqual(s.tags, ['docker', 'web']);
  assert.equal(s.auth, 'ssh-key');
});
