// Files copied into <skillDir> (paths relative to package root AND skillDir).
export const SKILL_FILES = [
  { path: 'SKILL.md' },
  { path: 'scripts/overview.sh', exec: true },
  { path: 'scripts/run.sh', exec: true },
  { path: 'scripts/health.sh', exec: true },
  { path: 'scripts/audit.sh', exec: true },
  { path: 'references/operations.md' },
  { path: 'references/deploy-playbooks.example.md' },
  { path: 'inventory.example.yml' },
  { path: 'servers/_example.md' },
  { path: 'README.md' },
  { path: 'LICENSE' },
];

// Copied to <commandPath>.
export const COMMAND_SRC = 'commands/h-ops.md';

// User-owned files: never overwritten by `update`; preserved by `uninstall` unless --purge.
// The protection is *structural*: `update`/`copyFramework` only ever writes SKILL_FILES, which is
// disjoint from this list and from real server manuals. These two exports document that contract
// and let the test suite enforce it (manifest.test.js asserts SKILL_FILES never overlaps user data).
// `relPath` here is always posix-style (forward slashes), as produced by the manifest itself.
export const USER_DATA_FILES = [
  'inventory.yml',
  'references/deploy-playbooks.md',
  'secrets.local.yml',
  'secrets.local.yaml',
];

export function isUserDataServerManual(relPath) {
  return /^servers\/.+\.md$/.test(relPath) && relPath !== 'servers/_example.md';
}
