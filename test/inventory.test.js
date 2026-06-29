import { test } from 'node:test';
import assert from 'node:assert/strict';
import YAML from 'yaml';
import { renderInventory, parseInventory, addServer } from '../src/lib/inventory.js';

const web = { ssh_alias: 'web', host: '10.0.0.1', user: 'ubuntu', role: 'prod', reverse_proxy: 'nginx', auth: 'ssh-key', os: 'Ubuntu 22.04', tags: ['docker', 'web'] };
const db = { ssh_alias: 'db', host: '10.0.0.2', user: 'root', role: 'dev', reverse_proxy: 'none', auth: 'ssh-key', tags: ['postgres'] };

test('renderInventory produces valid yaml with servers and groups', () => {
  const text = renderInventory([web, db]);
  const obj = YAML.parse(text);
  assert.equal(obj.servers.web.host, '10.0.0.1');
  assert.equal(obj.servers.web.notes_file, 'servers/web.md');
  assert.deepEqual(obj.groups.prod, ['web']);
  assert.deepEqual(obj.groups.dev, ['db']);
  assert.deepEqual(obj.groups.all, ['web', 'db']);
});

test('parseInventory returns servers map', () => {
  const obj = parseInventory(renderInventory([web]));
  assert.deepEqual(Object.keys(obj.servers), ['web']);
});

test('addServer appends, updates groups, and preserves comments', () => {
  const start = '# my fleet comment\n' + renderInventory([web]);
  const next = addServer(start, db);
  const obj = YAML.parse(next);
  assert.deepEqual(Object.keys(obj.servers), ['web', 'db']);
  assert.deepEqual(obj.groups.all, ['web', 'db']);
  assert.deepEqual(obj.groups.dev, ['db']);
  assert.match(next, /# my fleet comment/);
});

test('addServer rejects duplicate alias', () => {
  const text = renderInventory([web]);
  assert.throws(() => addServer(text, web), /already exists/);
});

test('addServer adds the first server to an empty inventory', () => {
  const empty = renderInventory([]); // servers: empty, groups: all: []
  const next = addServer(empty, web);
  const obj = YAML.parse(next);
  assert.deepEqual(Object.keys(obj.servers), ['web']);
  assert.deepEqual(obj.groups.all, ['web']);
  assert.deepEqual(obj.groups.prod, ['web']);
});
