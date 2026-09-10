# Install the tools in Brewfile (awscli, pulumi, node, pnpm, gh, jq, openssl).
brew_bundle

aws --version 2>&1 | grep -qE "aws-cli/2\.(2[2-9]|[3-9][0-9])" \
  || fail "AWS CLI is too old for browser login" "run: brew upgrade awscli"
ok "AWS CLI supports browser login"
