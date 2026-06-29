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
export const USER_DATA_FILES = [
  'inventory.yml',
  'references/deploy-playbooks.md',
  'secrets.local.yml',
  'secrets.local.yaml',
];

export function isUserDataServerManual(relPath) {
  return /^servers\/.+\.md$/.test(relPath) && relPath !== 'servers/_example.md';
}
