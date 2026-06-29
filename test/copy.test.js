import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copyFileTo, atomicWrite } from '../src/lib/copy.js';

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'hops-copy-')); }

test('copyFileTo creates parent dirs and sets exec bit', () => {
  const d = tmp();
  const src = path.join(d, 'src.sh');
  fs.writeFileSync(src, '#!/bin/sh\n');
  const dest = path.join(d, 'nested/out.sh');
  copyFileTo(src, dest, { exec: true });
  assert.equal(fs.readFileSync(dest, 'utf8'), '#!/bin/sh\n');
  assert.ok(fs.statSync(dest).mode & 0o100, 'owner-exec bit set');
});

test('atomicWrite writes content and leaves no temp file', () => {
  const d = tmp();
  const dest = path.join(d, 'a/b.txt');
  atomicWrite(dest, 'hello');
  assert.equal(fs.readFileSync(dest, 'utf8'), 'hello');
  assert.deepEqual(fs.readdirSync(path.dirname(dest)), ['b.txt']);
});
