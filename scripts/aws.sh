# Sign into AWS and let Pulumi reuse the CLI session.
if aws sts get-caller-identity >/dev/null 2>&1; then
  ok "AWS credentials configured"
else
  if grep -q credential_process ~/.aws/config 2>/dev/null; then
    sed -i '' '/credential_process/d' ~/.aws/config
  fi
  info "AWS is not authenticated"
  confirm "run 'aws login' now?" || fail "AWS auth is required" "run: aws login, then re-run ./setup.sh"
  aws login
  aws sts get-caller-identity >/dev/null 2>&1 || fail "aws login did not complete"
fi

# Pulumi's AWS provider reads credentials through the SDK, not the CLI cache.
if ! grep -q credential_process ~/.aws/config 2>/dev/null; then
  printf 'credential_process = aws configure export-credentials --format process\n' >> ~/.aws/config
  ok "linked the CLI session to the AWS SDK for Pulumi"
fi

account_id=$(aws sts get-caller-identity --query Account --output text)
ok "AWS account ${account_id}"
