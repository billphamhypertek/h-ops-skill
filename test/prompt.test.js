import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { createAsk } from '../src/lib/prompt.js';

function sink() { return new Writable({ write(_c, _e, cb) { cb(); } }); }

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
