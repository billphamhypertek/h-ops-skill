import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseHosts, renderSnippet, readHosts } from '../src/lib/sshconfig.js';

test('parseHosts extracts aliases, ignores comments and wildcards', () => {
  const cfg = `# comment\nHost web db\n    HostName 1.2.3.4\nHost *\n    User x\nHost prod-?\n`;
  assert.deepEqual(parseHosts(cfg), ['web', 'db']);
});

test('renderSnippet formats a Host block', () => {
  const snip = renderSnippet({ ssh_alias: 'web', host: '1.2.3.4', user: 'ubuntu' });
  assert.match(snip, /Host web/);
  assert.match(snip, /HostName 1\.2\.3\.4/);
  assert.match(snip, /User ubuntu/);
});

test('readHosts reads aliases from a config file', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hops-ssh-'));
  const cfg = path.join(d, 'config');
  fs.writeFileSync(cfg, '# comment\nHost web db\n    HostName 1.2.3.4\nHost *\n');
  assert.deepEqual(readHosts(cfg), ['web', 'db']);
});

test('readHosts returns [] when the file is unreadable', () => {
  const missing = path.join(os.tmpdir(), 'hops-no-such-ssh-config-xyz', 'config');
  assert.deepEqual(readHosts(missing), []);
});
