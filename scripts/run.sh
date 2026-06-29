#!/usr/bin/env bash
# h-ops run — run ONE command across servers. Usage: run.sh "<command>" <ssh_alias> [ssh_alias ...]
# Caller resolves aliases from inventory. SAFETY (confirm before mutating / prod / fan-out) is the
# caller's responsibility per SKILL.md — this script just executes what it is given.
set -uo pipefail
[ $# -lt 2 ] && { echo 'usage: '"$0"' "<command>" <ssh_alias> [ssh_alias ...]' >&2; exit 2; }
cmd="$1"; shift
SSH_OPTS=(-o ConnectTimeout=8 -o BatchMode=yes -o StrictHostKeyChecking=accept-new)

tmpdir="$(mktemp -d)"; trap 'rm -rf "$tmpdir"' EXIT
runone() {
  local a="$1"
  { echo "===== $a ====="; ssh "${SSH_OPTS[@]}" "$a" "$cmd" 2>&1; echo "[exit $?]"; } > "$tmpdir/$a.out"
}
for a in "$@"; do runone "$a" & done
wait
for a in "$@"; do cat "$tmpdir/$a.out"; echo; done
