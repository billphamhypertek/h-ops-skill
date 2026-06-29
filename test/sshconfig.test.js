import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHosts, renderSnippet } from '../src/lib/sshconfig.js';

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
