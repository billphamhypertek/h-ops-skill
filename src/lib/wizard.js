export async function promptServer(ask, { existingAliases = [] } = {}) {
  const ssh_alias = await ask('  ssh_alias (must match ~/.ssh/config)', {
    validate: (v) => (!v ? 'required' : existingAliases.includes(v) ? 'alias already used' : null),
  });
  const host = await ask('  host (IP or hostname)', { validate: (v) => (v ? null : 'required') });
  const user = await ask('  ssh user', { default: 'root' });
  const role = await ask('  role', { choices: ['prod', 'dev', 'staging', 'backup'], default: 'dev' });
  const reverse_proxy = await ask('  reverse_proxy', { choices: ['nginx', 'caddy', 'traefik', 'none'], default: 'none' });
  const os = await ask('  os (optional, e.g. "Ubuntu 24.04")', { default: '' });
  const tagsRaw = await ask('  tags (comma-separated, optional)', { default: '' });
  const auth = await ask('  auth', { choices: ['ssh-key', 'password'], default: 'ssh-key' });
  const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
  return {
    ssh_alias, host, user, role, reverse_proxy,
    os: os || undefined, tags, auth,
    notes_file: `servers/${ssh_alias}.md`,
  };
}
