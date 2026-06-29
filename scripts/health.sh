#!/usr/bin/env bash
# h-ops health — deep check for ONE server. Usage: health.sh <ssh_alias>
# Read-only. Caller passes one ssh alias (resolved from inventory).
set -uo pipefail
[ $# -ne 1 ] && { echo "usage: $0 <ssh_alias>" >&2; exit 2; }
alias="$1"
SSH_OPTS=(-o ConnectTimeout=8 -o BatchMode=yes -o StrictHostKeyChecking=accept-new)

read -r -d '' REMOTE <<'EOF'
export LC_ALL=C
echo "== uptime / load =="; uptime
echo; echo "== memory =="; free -h
echo; echo "== disk by mount =="; df -hP | awk 'NR==1 || ($1!~/tmpfs/ && $1!~/udev/ && $1!~/loop/)'
echo; echo "== top 5 by cpu =="; ps -eo pcpu,pmem,comm --sort=-pcpu 2>/dev/null | head -6
if command -v docker >/dev/null 2>&1; then
  echo; echo "== docker ps (name | status) =="
  docker ps -a --format '{{.Names}} | {{.Status}}' 2>/dev/null
  echo; echo "== containers with restartcount > 5 =="
  for c in $(docker ps -q 2>/dev/null); do
    n=$(docker inspect -f '{{.Name}}' "$c" 2>/dev/null | sed 's#^/##')
    r=$(docker inspect -f '{{.RestartCount}}' "$c" 2>/dev/null)
    case "$r" in ''|*[!0-9]*) : ;; *) [ "$r" -gt 5 ] && echo "  $n restarts=$r" ;; esac
  done
fi
echo; echo "== recent OOM (dmesg, may need root) =="
( dmesg -T 2>/dev/null || dmesg 2>/dev/null ) | grep -iE 'killed process|out of memory|oom-kill' | tail -5 || true
echo "(end)"
EOF

echo "### health: $alias"
ssh "${SSH_OPTS[@]}" "$alias" "$REMOTE" || { echo "UNREACHABLE: $alias" >&2; exit 1; }
