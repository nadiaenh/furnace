#!/usr/bin/env bash

# install openssl and jq.
for pair in "openssl:openssl" "jq:jq"; do
  bin="${pair%%:*}"; formula="${pair##*:}"
  if command -v "$bin" >/dev/null; then
    ok "$bin already installed"
  else
    quiet brew install "$formula" || fail "failed to install $bin" "see error output below, or install manually: brew install $formula"
    ok "installed $bin"
  fi
done

# verify npm is available.
command -v npm >/dev/null || fail "npm not found" "install node (e.g. brew install node), then re-run"
ok "npm found"

# install pnpm.
if command -v pnpm >/dev/null; then
  ok "pnpm already installed"
else
  quiet brew install pnpm || fail "failed to install pnpm" "see error output below, or install manually: brew install pnpm"
  ok "installed pnpm"
fi
