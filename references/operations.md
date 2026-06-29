# h-ops operations — detailed how-to

All target resolution: read `../inventory.yml`, map name/group/`all` → `ssh_alias` list, pass aliases
to the scripts. Scripts never read YAML.

## connect <srv>
1. Read `../servers/<srv>.md` for current services + landmines.
2. `ssh <alias>` and run a quick health check: `uptime; df -h /; free -h; docker ps`.
3. Wait for the user's instructions. Apply the safety rules before any mutate (prod ⇒ confirm).

## overview
`scripts/overview.sh <alias...>` for every server in `servers:`. Print the table as-is.

## health <srv>
1. `scripts/health.sh <alias>`.
2. TLS cert expiry for each domain listed in `../servers/<srv>.md`:
   `echo | openssl s_client -servername <domain> -connect <domain>:443 2>/dev/null | openssl x509 -noout -enddate`
   Flag anything expiring within 21 days.

## run <srv|group|all> "<cmd>"
`scripts/run.sh "<cmd>" <alias...>`. Before running: if the command mutates state (not a pure read),
or any target is `role: prod`, or it targets a multi-server group/`all`, state exactly what will run
and confirm first.

## audit [srv|all]
`scripts/audit.sh <alias...>` (default to `all`). Summarize: public-bound ports, unexpected sudo
members, pending security updates, disks ≥80%, root containers. Cross-check against each server's
landmines (e.g. a host whose ports should be 127.0.0.1-only).

## deploy <srv>
Follow `deploy-playbooks.md` (your local copy; see `deploy-playbooks.example.md` for the format).
Confirm before acting on a prod server.
