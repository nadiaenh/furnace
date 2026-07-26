#!/usr/bin/env bash

# check AWS auth.
if aws sts get-caller-identity >/dev/null 2>&1; then
  ok "aws credentials already configured"
else
  echo
  echo "→ aws isn't authenticated yet. run this, then re-run ./setup.sh:"
  echo
  echo "    aws login"
  echo
  exit 0
fi

# check that Pulumi can use the AWS CLI credentials.
if ! grep -q "^credential_process" ~/.aws/config 2>/dev/null; then
  printf 'credential_process = aws configure export-credentials --format process\n' >> ~/.aws/config
  ok "added credential_process to ~/.aws/config so pulumi can use the cli login session"
else
  ok "credential_process already configured for sdk-based tools"
fi

# resolve the account ID used by later steps.
account_id=$(aws sts get-caller-identity --query Account --output text)
