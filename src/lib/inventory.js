import YAML from 'yaml';

const HEADER = `# h-ops fleet inventory — SINGLE SOURCE OF TRUTH. NO SECRETS HERE. (gitignored: real data)
# Add a server under \`servers:\` and to the relevant \`groups:\`. ssh_alias must match ~/.ssh/config.`;

const ROLE_ORDER = ['prod', 'staging', 'dev', 'backup'];

export function renderInventory(servers) {
  const lines = [HEADER, 'servers:'];
  for (const s of servers) {
    lines.push(`  ${s.ssh_alias}:`);
    lines.push(`    host: ${s.host}`);
    lines.push(`    user: ${s.user}`);
    lines.push(`    ssh_alias: ${s.ssh_alias}`);
    lines.push(`    auth: ${s.auth}`);
    lines.push(`    role: ${s.role}`);
    lines.push(`    reverse_proxy: ${s.reverse_proxy}`);
    if (s.os) lines.push(`    os: ${JSON.stringify(s.os)}`);
    lines.push(`    tags: [${(s.tags || []).join(', ')}]`);
    lines.push(`    notes_file: servers/${s.ssh_alias}.md`);
  }
  lines.push('', 'groups:');
  for (const role of ROLE_ORDER) {
    const members = servers.filter((s) => s.role === role).map((s) => s.ssh_alias);
    if (members.length) lines.push(`  ${role}: [${members.join(', ')}]`);
  }
  lines.push(`  all: [${servers.map((s) => s.ssh_alias).join(', ')}]`);
  return lines.join('\n') + '\n';
}

export function parseInventory(text) {
  return YAML.parse(text) || { servers: {}, groups: {} };
}

export function addServer(text, server) {
  const doc = YAML.parseDocument(text);
  let servers = doc.get('servers');
  if (!servers) { doc.set('servers', {}); servers = doc.get('servers'); }
  if (servers.has(server.ssh_alias)) {
    throw new Error(`Server "${server.ssh_alias}" already exists in inventory.`);
  }
  const node = doc.createNode({
    host: server.host,
    user: server.user,
    ssh_alias: server.ssh_alias,
    auth: server.auth,
    role: server.role,
    reverse_proxy: server.reverse_proxy,
    ...(server.os ? { os: server.os } : {}),
    tags: server.tags || [],
    notes_file: `servers/${server.ssh_alias}.md`,
  });
  const tagsNode = node.get('tags', true);
  if (tagsNode) tagsNode.flow = true;
  servers.set(server.ssh_alias, node);

  let groups = doc.get('groups');
  if (!groups) { doc.set('groups', {}); groups = doc.get('groups'); }
  for (const key of [server.role, 'all']) {
    let seq = groups.get(key);
    if (!seq) { seq = doc.createNode([]); groups.set(key, seq); }
    const has = seq.items.some((it) => (it && it.value !== undefined ? it.value : it) === server.ssh_alias);
    if (!has) seq.add(server.ssh_alias);
    seq.flow = true;
  }
  return String(doc);
}
