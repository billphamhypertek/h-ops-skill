#!/usr/bin/env bash
# h-ops overview — fleet status table. Usage: overview.sh <ssh_alias> [ssh_alias ...]
# Reads NO YAML: caller passes ssh aliases. Read-only on every host.
set -uo pipefail
[ $# -eq 0 ] && { echo "usage: $0 <ssh_alias> [ssh_alias ...]" >&2; exit 2; }
SSH_OPTS=(-o ConnectTimeout=8 -o BatchMode=yes -o StrictHostKeyChecking=accept-new)

read -r -d '' REMOTE <<'EOF'
export LC_ALL=C
load=$(cut -d' ' -f1-3 /proc/loadavg)
disk=$(df -hP / | awk 'NR==2{print $5" "$3"/"$2}')
mem=$(free -m | awk '/^Mem:/{printf "%d/%dMi", $3, $2}')
up=$(uptime -p 2>/dev/null | sed 's/^up //'); [ -z "$up" ] && up="?"
if command -v docker >/dev/null 2>&1; then dock=$(docker ps -q 2>/dev/null | wc -l | tr -d ' '); else dock="-"; fi
printf '%s\t%s\t%s\t%s\t%s' "$load" "$disk" "$mem" "$dock" "$up"
EOF

tmpdir="$(mktemp -d)"; trap 'rm -rf "$tmpdir"' EXIT
probe() {
  local a="$1" out
  out="$(ssh "${SSH_OPTS[@]}" "$a" "$REMOTE" 2>/dev/null)"
  if [ -z "$out" ]; then printf '%s\tUNREACHABLE\t-\t-\t-\t-\n' "$a" > "$tmpdir/$a.row"
  else printf '%s\t%s\n' "$a" "$out" > "$tmpdir/$a.row"; fi
}
for a in "$@"; do probe "$a" & done
wait
{
  printf 'SERVER\tLOAD(1/5/15)\tDISK_/\tMEM\tDOCKER\tUPTIME\n'
  for a in "$@"; do cat "$tmpdir/$a.row" 2>/dev/null; done
} | column -t -s "$(printf '\t')"
