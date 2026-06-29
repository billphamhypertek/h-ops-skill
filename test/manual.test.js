import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderServerManual } from '../src/lib/manual.js';

test('renderServerManual fills header, ssh line, role', () => {
  const md = renderServerManual({ ssh_alias: 'web', host: '1.2.3.4', user: 'ubuntu', role: 'prod', reverse_proxy: 'nginx', os: 'Ubuntu 22.04' });
  assert.match(md, /^# web — operating manual/m);
  assert.match(md, /ssh web/);
  assert.match(md, /ubuntu@1\.2\.3\.4/);
  assert.match(md, /Role: prod/);
  assert.match(md, /Reverse proxy: nginx/);
});
