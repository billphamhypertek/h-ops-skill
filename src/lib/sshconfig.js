import fs from 'node:fs';

export function parseHosts(text) {
  const hosts = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^Host\s+(.+)$/i);
    if (!m) continue;
    for (const token of m[1].split(/\s+/)) {
      if (token && !token.includes('*') && !token.includes('?')) hosts.push(token);
    }
  }
  return hosts;
}

export function readHosts(configPath) {
  try { return parseHosts(fs.readFileSync(configPath, 'utf8')); }
  catch { return []; }
}

export function renderSnippet(server) {
  return [
    `Host ${server.ssh_alias}`,
    `    HostName ${server.host}`,
    `    User ${server.user}`,
    '    IdentityFile ~/.ssh/id_ed25519',
  ].join('\n');
}
