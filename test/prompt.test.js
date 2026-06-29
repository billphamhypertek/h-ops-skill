import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { createAsk } from '../src/lib/prompt.js';

function sink() { return new Writable({ write(_c, _e, cb) { cb(); } }); }

// Captures everything written to the prompt's output stream.
function capture() {
  const chunks = [];
  const stream = new Writable({ write(c, _e, cb) { chunks.push(c.toString()); cb(); } });
  stream.text = () => chunks.join('');
  return stream;
}

const tick = () => new Promise((r) => setImmediate(r));

// Write `line` only once `output` shows `marker` (the re-prompt), so readline always has a live
// consumer for the line and we never race ahead of the interface.
async function writeAfter(input, output, marker, line) {
  for (let i = 0; i < 50 && !output.text().includes(marker); i++) await tick();
  input.write(line);
}

test('createAsk returns trimmed answer or default', async () => {
  const input = new PassThrough();
  const ask = createAsk({ input, output: sink() });

  // Write each line only after its question is active, so the readline
  // interface always has a registered consumer (avoids ERR_USE_AFTER_CLOSE
  // and dropped-line races from a pre-filled/ended stream).
  const p1 = ask('q1');
  input.write('  hi  \n');
  assert.equal(await p1, 'hi');

  const p2 = ask('q2', { default: 'def' });
  input.write('\n');
  assert.equal(await p2, 'def');

  ask.close();
});

test('createAsk re-prompts until a valid choice is given', async () => {
  const input = new PassThrough();
  const output = capture();
  const ask = createAsk({ input, output });

  const p = ask('role', { choices: ['prod', 'dev'] });
  input.write('bogus\n');
  await writeAfter(input, output, 'must be one of', 'dev\n');
  assert.equal(await p, 'dev');
  assert.match(output.text(), /must be one of: prod, dev/);

  ask.close();
});

test('createAsk re-prompts when validate returns an error', async () => {
  const input = new PassThrough();
  const output = capture();
  const ask = createAsk({ input, output });

  const p = ask('host', { validate: (v) => (v ? null : 'required') });
  input.write('\n'); // blank → validate error
  await writeAfter(input, output, 'required', '1.2.3.4\n');
  assert.equal(await p, '1.2.3.4');
  assert.match(output.text(), /required/);

  ask.close();
});

test('createAsk shows both the choices and the default in the prompt', async () => {
  const input = new PassThrough();
  const output = capture();
  const ask = createAsk({ input, output });

  const p = ask('role', { choices: ['prod', 'dev', 'staging', 'backup'], default: 'dev' });
  input.write('\n'); // accept default
  assert.equal(await p, 'dev');
  assert.match(output.text(), /role \(prod\/dev\/staging\/backup\) \[dev\]:/);

  ask.close();
});

test('createAsk treats a blank answer as invalid when choices have no default', async () => {
  const input = new PassThrough();
  const output = capture();
  const ask = createAsk({ input, output });

  const p = ask('role', { choices: ['prod', 'dev'] });
  input.write('\n'); // blank, no default → must re-prompt, not return ''
  await writeAfter(input, output, 'must be one of', 'prod\n');
  assert.equal(await p, 'prod');

  ask.close();
});
