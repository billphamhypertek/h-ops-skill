#!/usr/bin/env bash
# h-ops snapshot — capture a server's security-relevant state as a canonical, sorted text dump.
# Usage: snapshot.sh <ssh_alias> [extra_config_path ...]
# Read-only on the host. Extra config paths (absolute) are checksummed in addition to the default
# set; the caller (Claude) passes any declared in servers/<name>.md. Degrades gracefully without root.
# Output grammar is documented in references/operations.md (Claude parses it into the state JSON).
set -uo pipefail
[ $# -lt 1 ] && { echo "usage: $0 <ssh_alias> [extra_config_path ...]" >&2; exit 2; }
alias="$1"; shift
SSH_OPTS=(-o ConnectTimeout=8 -o BatchMode=yes -o StrictHostKeyChecking=accept-new)

ssh "${SSH_OPTS[@]}" "$alias" bash -s -- "$@" <<'EOF' || { echo "UNREACHABLE: $alias" >&2; exit 1; }
export LC_ALL=C
if [ "$(id -u 2>/dev/null)" = "0" ]; then IS_ROOT=1; else IS_ROOT=0; fi

# Read stdin; print it, or a sentinel when empty. needs_root=1 → empty-without-root is "unavailable".
emit_list() {
  local needs_root="${1:-0}" out; out="$(cat)"
  if [ -n "$out" ]; then printf '%s\n' "$out"
  elif [ "$needs_root" = "1" ] && [ "$IS_ROOT" != "1" ]; then echo "(unavailable: needs root)"
  else echo "(none)"; fi
}

echo "[META]"
printf 'captured_at\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo '?')"
printf 'hostname\t%s\n' "$(hostname 2>/dev/null || echo '?')"

echo "[CONTAINERS]"
if command -v docker >/dev/null 2>&1; then
  for c in $(docker ps -q 2>/dev/null); do
    name=$(docker inspect -f '{{.Name}}' "$c" 2>/dev/null | sed 's#^/##')
    image=$(docker inspect -f '{{.Config.Image}}' "$c" 2>/dev/null)
    restart=$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$c" 2>/dev/null)
    ports=$(docker inspect -f '{{range $p, $b := .HostConfig.PortBindings}}{{range $b}}{{.HostIp}}:{{.HostPort}}->{{$p}} {{end}}{{end}}' "$c" 2>/dev/null \
            | tr ' ' '\n' | grep -v '^$' | sort -u | paste -sd, -)
    printf '%s\t%s\t%s\t%s\n' "$name" "$image" "${restart:-no}" "$ports"
  done | sort | emit_list 0
else echo "(unavailable)"; fi

echo "[NETWORK.LISTENING]"
if command -v ss >/dev/null 2>&1 || command -v netstat >/dev/null 2>&1; then
  ( ss -tlnH 2>/dev/null | awk '{print $4}' || netstat -tln 2>/dev/null | awk 'NR>2{print $4}' ) \
    | sort -u | emit_list 0
else echo "(unavailable)"; fi

echo "[NETWORK.FIREWALL]"
if command -v ufw >/dev/null 2>&1 && ufw status >/dev/null 2>&1; then
  printf 'backend\tufw\n'; ufw status 2>/dev/null | awk 'NR>1 && NF' | sort
elif command -v nft >/dev/null 2>&1 && nft list ruleset >/dev/null 2>&1; then
  printf 'backend\tnft\n'; nft list ruleset 2>/dev/null | sed 's/[[:space:]]\{1,\}/ /g;s/^ //;s/ $//' | grep -vE '^$' | sort
elif command -v iptables >/dev/null 2>&1 && iptables -S >/dev/null 2>&1; then
  printf 'backend\tiptables\n'; iptables -S 2>/dev/null | sort
elif { command -v ufw || command -v nft || command -v iptables; } >/dev/null 2>&1; then
  printf 'backend\tunknown\n'; echo "(unavailable: needs root)"
else
  printf 'backend\tnone\n'
fi

echo "[ACCESS.SHELL_USERS]"
getent passwd 2>/dev/null | awk -F: '$7 ~ /\/(sh|bash|zsh|fish|ash|dash)$/ {print $1}' | sort -u | emit_list 0

echo "[ACCESS.SUDO]"
{ getent group sudo 2>/dev/null | cut -d: -f4 | tr ',' '\n'
  getent group wheel 2>/dev/null | cut -d: -f4 | tr ',' '\n'; } | grep -v '^$' | sort -u | emit_list 0

echo "[ACCESS.AUTHORIZED_KEYS]"
getent passwd 2>/dev/null | awk -F: '$7 ~ /\/(sh|bash|zsh|fish|ash|dash)$/ {print $1":"$6}' | while IFS=: read -r u home; do
  ak="$home/.ssh/authorized_keys"
  [ -r "$ak" ] || continue
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|\#*) continue ;; esac
    fp=$(printf '%s\n' "$line" | ssh-keygen -lf - 2>/dev/null | awk '{print $2" ("$NF")"}')
    [ -n "$fp" ] && printf '%s\t%s\n' "$u" "$fp"
  done < "$ak"
done | sort -u | emit_list 1

echo "[ACCESS.SSHD]"
for k in passwordauthentication permitrootlogin pubkeyauthentication; do
  v=$(sshd -T 2>/dev/null | awk -v k="$k" 'tolower($1)==k{print $2; exit}')
  [ -z "$v" ] && v=$(grep -iE "^[[:space:]]*${k}[[:space:]]" /etc/ssh/sshd_config 2>/dev/null | awk '{print $2; exit}')
  printf '%s\t%s\n' "$k" "${v:-?}"
done

echo "[SYSTEM.KERNEL]"
uname -r 2>/dev/null || echo "(unavailable)"

echo "[SYSTEM.PACKAGES_SECURITY]"
SECPKGS="openssl openssh-server sudo libssl3 libpam-modules systemd libc6 curl"
if command -v dpkg-query >/dev/null 2>&1; then
  for p in $SECPKGS; do
    v=$(dpkg-query -W -f='${Version}' "$p" 2>/dev/null) && [ -n "$v" ] && printf '%s\t%s\n' "$p" "$v"
  done | sort | emit_list 0
elif command -v rpm >/dev/null 2>&1; then
  for p in $SECPKGS; do
    v=$(rpm -q --qf '%{VERSION}-%{RELEASE}\n' "$p" 2>/dev/null) && [ -n "$v" ] && printf '%s\t%s\n' "$p" "$v"
  done | sort | emit_list 0
else echo "(unavailable)"; fi

echo "[SYSTEM.PACKAGES_ALL_HASH]"
if command -v dpkg-query >/dev/null 2>&1 && command -v sha256sum >/dev/null 2>&1; then
  h=$(dpkg-query -W -f='${Package} ${Version}\n' 2>/dev/null | sort | sha256sum | awk '{print $1}')
  if [ -n "$h" ]; then printf 'sha256:%s\n' "$h"; else echo "(unavailable)"; fi
elif command -v rpm >/dev/null 2>&1 && command -v sha256sum >/dev/null 2>&1; then
  h=$(rpm -qa 2>/dev/null | sort | sha256sum | awk '{print $1}')
  if [ -n "$h" ]; then printf 'sha256:%s\n' "$h"; else echo "(unavailable)"; fi
else echo "(unavailable)"; fi

echo "[SYSTEM.CRON]"
{
  for f in /etc/crontab /etc/cron.d/*; do [ -r "$f" ] && sed 's/[[:space:]]\{1,\}/ /g' "$f"; done
  for u in $(getent passwd 2>/dev/null | cut -d: -f1); do crontab -l -u "$u" 2>/dev/null; done
} 2>/dev/null | grep -vE '^[[:space:]]*#' | grep -vE '^[[:space:]]*$' | sort -u | emit_list 1

echo "[SYSTEM.TIMERS]"
if command -v systemctl >/dev/null 2>&1; then
  systemctl list-unit-files --type=timer --no-legend --no-pager 2>/dev/null | awk 'NF{print $1" "$2}' | sort -u | emit_list 0
else echo "(unavailable)"; fi

echo "[SYSTEM.CONFIG_CHECKSUMS]"
if command -v sha256sum >/dev/null 2>&1; then
  for f in /etc/ssh/sshd_config /etc/sudoers /etc/nginx/nginx.conf /etc/caddy/Caddyfile "$@"; do
    [ -r "$f" ] || continue
    h=$(sha256sum "$f" 2>/dev/null | awk '{print $1}')
    [ -n "$h" ] && printf '%s\tsha256:%s\n' "$f" "$h"
  done | sort -u | emit_list 1
else echo "(unavailable)"; fi

echo "[END]"
EOF
