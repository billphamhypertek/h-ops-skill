export function renderServerManual(server) {
  const proxy = server.reverse_proxy && server.reverse_proxy !== 'none' ? server.reverse_proxy : 'none';
  return `# ${server.ssh_alias} — operating manual

> Present-tense ops manual. Keep it short and current.

## Snapshot
- \`ssh ${server.ssh_alias}\` (${server.user}@${server.host}, key \`~/.ssh/id_ed25519\`, passwordless). sudo: ?
- OS: ${server.os || '?'}. vCPU / RAM (+swap) / disk: ?
- Reverse proxy: ${proxy} — config path, TLS method.
- Role: ${server.role}.

## Services (current)
- Service → public domain → internal port; compose file location.

## Landmines / must-not-break
- Active constraints phrased as imperatives.

## Operational playbooks
- Quick health: \`ssh ${server.ssh_alias} 'uptime; df -h /; free -h; docker ps'\`.
`;
}
