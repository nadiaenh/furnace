# Create the S3 state bucket, initialize the stack, and set its config.
have pulumi || fail "Pulumi CLI not installed" "run: brew install pulumi"

passphrase_file=".pulumi-passphrase"
if [ -f "$passphrase_file" ]; then
  ok "Pulumi passphrase already set"
else
  read -rsp "  choose a Pulumi passphrase (encrypts stack secrets): " passphrase
  echo
  [ -n "$passphrase" ] || fail "no passphrase entered"
  printf '%s' "$passphrase" > "$passphrase_file"
  chmod 600 "$passphrase_file"
  ok "saved the passphrase to $passphrase_file (git-ignored)"
fi
export PULUMI_CONFIG_PASSPHRASE
PULUMI_CONFIG_PASSPHRASE=$(cat "$passphrase_file")

quiet pnpm install || fail "pnpm install failed"
quiet bash -c "cd broker && pnpm install --prod --config.node-linker=hoisted" || fail "broker pnpm install failed"
ok "installed dependencies"

bucket="sockpuppet-pulumi-state-${account_id}"
if quiet aws s3api head-bucket --bucket "$bucket"; then
  ok "state bucket $bucket exists"
else
  if [ "$region" = "us-east-1" ]; then
    quiet aws s3api create-bucket --bucket "$bucket" --region "$region" || fail "could not create the state bucket"
  else
    quiet aws s3api create-bucket --bucket "$bucket" --region "$region" \
      --create-bucket-configuration "LocationConstraint=$region" || fail "could not create the state bucket"
  fi
  quiet aws s3api put-bucket-versioning --bucket "$bucket" --versioning-configuration Status=Enabled \
    || fail "could not enable bucket versioning"
  quiet aws s3api put-public-access-block --bucket "$bucket" --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
    || fail "could not lock down the state bucket"
  ok "created state bucket $bucket"
fi

quiet pulumi login "s3://${bucket}?region=${region}" || fail "pulumi login failed"
if quiet pulumi stack select "$stack"; then
  ok "stack '$stack' selected"
else
  quiet pulumi stack init "$stack" || fail "could not initialize the stack"
  ok "stack '$stack' created"
fi

# Recover from a committed Pulumi.<stack>.yaml encrypted with a different passphrase.
if quiet pulumi config set --secret _probe ok && quiet pulumi config rm _probe; then
  ok "passphrase matches the stack encryption salt"
else
  info "passphrase does not match Pulumi.$stack.yaml — resetting the salt"
  grep -vE '^encryptionsalt:' "Pulumi.$stack.yaml" > "Pulumi.$stack.yaml.tmp" && mv "Pulumi.$stack.yaml.tmp" "Pulumi.$stack.yaml"
  quiet pulumi config rm apiKey || true
  quiet pulumi config set --secret _probe ok && quiet pulumi config rm _probe || fail "could not reset stack encryption"
  ok "stack encryption salt reset"
fi

quiet pulumi config set aws:region "$region" || fail "could not set the region"

if quiet pulumi config get apiKey; then
  ok "broker API key already set"
else
  quiet pulumi config set --secret apiKey "$(openssl rand -hex 24)" || fail "could not set the broker API key"
  ok "generated the broker API key"
fi
api_key=$(pulumi config get apiKey)

quiet pulumi config set --secret groqApiKey "$(env_get GROQ_API_KEY)" || fail "could not set groqApiKey"
ok "stored the Groq API key in the stack"
