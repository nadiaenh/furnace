#!/usr/bin/env bash

# check for homebrew.
command -v brew >/dev/null || fail "homebrew not found" "install it from https://brew.sh, then re-run"
ok "homebrew found"
