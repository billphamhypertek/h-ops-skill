# <server-name> — operating manual (EXAMPLE / template)

> Present-tense ops manual. Keep it short and current. Put dated history (upgrades, removals,
> backups taken on a date) wherever you keep notes — not here.
> Copy this to `servers/<your-server>.md` (gitignored) and fill it in.

## Snapshot
- `ssh <ssh_alias>` (`<user>@<host>`, key `~/.ssh/id_...`, passwordless). sudo: yes/no.
- OS, vCPU / RAM (+ swap) / disk.
- Reverse proxy: nginx | caddy | traefik | none — config path, TLS method.
- Role: prod | dev | staging | backup.

## Services (current)
- Service → public domain → internal port; compose file location.
- Repeat per service.

## Landmines / must-not-break
- Active constraints phrased as imperatives, e.g.:
  - "Recreating <container> MUST keep bind-mount <…> / proxy header <…>."
  - "All container ports bind 127.0.0.1; only the reverse proxy is public."
  - "Low RAM — watch memory on heavy ops."

## Operational playbooks
- Quick health: `ssh <ssh_alias> 'uptime; df -h /; free -h; docker ps'`.
- Repeatable steps for routine ops (redeploys, restarts) — confirm first on prod.
