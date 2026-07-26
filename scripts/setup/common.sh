#!/usr/bin/env bash

# temp file that captures each command's output for error reporting.
log=$(mktemp)
trap 'rm -f "$log"' EXIT
export AWS_PAGER=""

# print a checkmarked success line.
ok()   { echo "✓ $1"; }

# print a failure line with a hint and any captured error output, then exit.
fail() {
  echo "✗ $1"
  echo "  → $2"
  if [ -s "$log" ]; then
    echo "  ── error output ──"
    sed 's/^/  /' "$log"
  fi
  exit 1
}

# run a command + capture output to $log + clear $log on success.
quiet() { "$@" >"$log" 2>&1 && : >"$log"; }
