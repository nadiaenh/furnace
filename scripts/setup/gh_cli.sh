#!/usr/bin/env bash

# install the GitHub CLI.
if command -v gh >/dev/null; then
  ok "gh cli already installed"
else
  quiet brew install gh || fail "failed to install gh cli" "see error output below, or install manually: brew install gh"
  ok "installed gh cli"
fi
