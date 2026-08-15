#!/usr/bin/env bash
# Start one ai-os service in the background, detached, and return immediately.
#
#   start-service.sh <name> <port> <dir> <logfile> <pidfile> -- <command...>
#
# ## Why this is a script and not three lines in the Makefile
#
# Two things fought the Makefile version and both are the kind of bug that costs
# an afternoon:
#
# 1. **Make collapses a recipe onto one line**, so a `case` with `;;` inside a
#    command substitution is a syntax error in a target whose job is to be
#    reliable.
# 2. **A backgrounded child inherits the parent's file descriptors.** `make up |
#    tail` then never returns: the service is running fine, the pipe is still
#    open, and the terminal just sits there. `setsid` plus closing stdin is what
#    actually detaches it — redirecting stdout and stderr alone is not enough.
#
# Idempotent: a port already in use is reported and left alone, so re-running
# `make up` on a live stack is a no-op rather than three processes fighting over
# a port with one of them dying into a log nobody reads.
set -euo pipefail

name=$1; port=$2; dir=$3; log=$4; pidfile=$5; shift 5
[[ "${1:-}" == "--" ]] && shift

if lsof -ti:"$port" > /dev/null 2>&1; then
  printf '%-6s already on %s\n' "$name:" "$port"
  exit 0
fi

mkdir -p "$(dirname "$log")" "$(dirname "$pidfile")"
printf '%-6s starting on %s\n' "$name:" "$port"

# setsid detaches into a new session so the service outlives this shell and does
# not hold the caller's pipe. Fall back to a plain background job where setsid
# is missing (macOS without coreutils), with stdin closed for the same reason.
cd "$dir"
if command -v setsid > /dev/null 2>&1; then
  setsid "$@" > "$log" 2>&1 < /dev/null &
else
  "$@" > "$log" 2>&1 < /dev/null &
  disown
fi
echo $! > "$pidfile"

# Wait until the port actually accepts a connection before returning.
#
# Without this, `make up` starts all three at once and the desk comes up before
# flows is listening — it logs "cannot reach ai-flows", gives up, and the whole
# thing fails on a dependency that was thirty seconds from being ready. Starting
# a service is not the same as a service being startED, and the difference is
# the only reason a cold `make up` used to fail.
#
# The port accepting is the right check, not an HTTP 200: core answers 401 to an
# unauthenticated probe and that is a healthy core.
for _ in $(seq 1 60); do
  if nc -z localhost "$port" 2>/dev/null; then
    exit 0
  fi
  # If the process died, say so now rather than after the full timeout.
  if ! kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "       $name exited during startup; last lines of $log:" >&2
    tail -n 12 "$log" >&2 || true
    exit 1
  fi
  sleep 1
done
echo "       $name never opened port $port; last lines of $log:" >&2
tail -n 12 "$log" >&2
exit 1
