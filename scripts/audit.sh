#!/usr/bin/env bash
# h-ops audit — security/ops audit across servers. Usage: audit.sh <ssh_alias> [ssh_alias ...]
# Read-only. Some checks are richer with root but degrade gracefully.
set -uo pipefail
[ $# -eq 0 ] && { echo "usage: $0 <ssh_alias> [ssh_alias ...]" >&2; exit 2; }
SSH_OPTS=(-o ConnectTimeout=8 -o BatchMode=yes -o StrictHostKeyChecking=accept-new)

read -r -d '' REMOTE <<'EOF'
export LC_ALL=C
echo "-- listening ports (local addr) --"
( ss -tlnH 2>/dev/null | awk '{print $4}' || netstat -tln 2>/dev/null | awk 'NR>2{print $4}' ) | sort -u | tail -50
echo "-- sudo group members --"
getent group sudo 2>/dev/null | cut -d: -f4
echo "-- pending security updates (apt) --"
if command -v apt-get >/dev/null 2>&1; then
  n=$(apt-get -s upgrade 2>/dev/null | grep -ic '^inst.*securi'); echo "  ${n:-0} security-tagged upgrade(s)"
else echo "  (no apt)"; fi
echo "-- disk pressure (>=80%) --"
df -hP | awk 'NR>1 && $5+0>=80 {print "  "$6"  "$5}'; echo "  (scan done)"
echo "-- containers running as root --"
if command -v docker >/dev/null 2>&1; then
  for c in $(docker ps -q 2>/dev/null); do
    u=$(docker inspect -f '{{.Config.User}}' "$c" 2>/dev/null)
    n=$(docker inspect -f '{{.Name}}' "$c" 2>/dev/null | sed 's#^/##')
    if [ -z "$u" ] || [ "$u" = "0" ] || [ "$u" = "root" ]; then echo "  $n (User='${u:-<empty=root>}')"; fi
  done
else echo "  (no docker)"; fi
echo "(end)"
EOF

for a in "$@"; do
  echo "########## audit: $a ##########"
  ssh "${SSH_OPTS[@]}" "$a" "$REMOTE" 2>&1 || echo "UNREACHABLE: $a"
  echo
done
