#!/usr/bin/env bash

# install the Pulumi CLI.
if command -v pulumi >/dev/null; then
  ok "pulumi already installed"
else
  quiet brew install pulumi || fail "failed to install pulumi" "see error output below, or install manually: brew install pulumi"
  ok "installed pulumi"
fi
