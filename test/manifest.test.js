import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKILL_FILES, COMMAND_SRC, USER_DATA_FILES, isUserDataServerManual } from '../src/lib/manifest.js';

test('SKILL_FILES includes SKILL.md and executable scripts', () => {
  const paths = SKILL_FILES.map((f) => f.path);
  assert.ok(paths.includes('SKILL.md'));
  const overview = SKILL_FILES.find((f) => f.path === 'scripts/overview.sh');
  assert.equal(overview.exec, true);
});

test('COMMAND_SRC is the command file', () => {
  assert.equal(COMMAND_SRC, 'commands/h-ops.md');
});

test('USER_DATA_FILES protects inventory and deploy playbooks', () => {
  assert.ok(USER_DATA_FILES.includes('inventory.yml'));
  assert.ok(USER_DATA_FILES.includes('references/deploy-playbooks.md'));
});

test('isUserDataServerManual distinguishes example from real manuals', () => {
  assert.equal(isUserDataServerManual('servers/web.md'), true);
  assert.equal(isUserDataServerManual('servers/_example.md'), false);
  assert.equal(isUserDataServerManual('SKILL.md'), false);
});
