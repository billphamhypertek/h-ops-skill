# h-ops deploy playbooks (EXAMPLE / template)

Copy this file to `deploy-playbooks.md` (gitignored) and replace the examples with your real
deploy steps. Always confirm before acting on a `role: prod` server.

## <server> — <app name> (static SPA example)
- Source on your machine: `/path/to/app` (repo `org/app`).
- Backend: <e.g. managed cloud> — note whether anything server-side runs on the VPS.
- Steps:
  1. Local: `cd /path/to/app && <build command, e.g. bun run build>`
  2. Local: `rsync -az --delete dist/ <ssh_alias>:/var/www/<domain>/`
  3. Reload the reverse proxy only if config changed (content updates usually need no reload).
- Never let build-time secrets reach the published bundle.

## <server> — <docker stack example>
- Compose at `/opt/<stack>/` on the host.
- Redeploy: `ssh <ssh_alias> 'cd /opt/<stack> && docker compose pull && docker compose up -d'`
  (confirm first; watch memory on low-RAM hosts).

## <server> — special-case service (example)
- Some services must preserve specific bind-mounts or proxy headers on recreate. Record those
  constraints in `../servers/<server>.md` landmines and prefer `docker restart <name>` over a full
  recreate when a mount/header must survive.

## Adding a new app playbook
Append a section to your local `deploy-playbooks.md`; no skill-logic change needed.
