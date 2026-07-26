#!/usr/bin/env bash

# sign into GitHub via browser if not already authenticated.
if ! gh auth status >/dev/null 2>&1; then

  # check existing GitHub token first.
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    fail "GITHUB_TOKEN is set in your environment but is not valid for gh" \
      "unset it (unset GITHUB_TOKEN) or replace it with a token that has repo scope, then re-run"
  fi

  echo "→ no gh auth found — opening browser to sign in"
  gh auth login -w
  gh auth status >/dev/null 2>&1 || fail "gh login did not complete" "re-run ./setup.sh and finish the browser sign-in"
fi
ok "gh cli authenticated"
