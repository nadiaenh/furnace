#!/usr/bin/env bash

# install the AWS CLI.
if command -v aws >/dev/null; then
  ok "aws already installed"
else
  quiet brew install awscli || fail "failed to install aws" "see error output below, or install manually: brew install awscli"
  ok "installed aws"
fi

# verify the version supports browser login.
aws --version 2>&1 | grep -qE "aws-cli/2\.(2[2-9]|[3-9][0-9])" \
  || fail "aws cli too old for browser login" "run: brew upgrade awscli"
ok "aws cli version supports browser login"
