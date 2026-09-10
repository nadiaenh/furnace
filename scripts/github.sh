# Authenticate gh, create the OIDC deploy role, and push the CI secrets.
have gh || fail "GitHub CLI not installed" "run: brew install gh"
if ! gh auth status >/dev/null 2>&1; then
  [ -z "${GITHUB_TOKEN:-}" ] || fail "GITHUB_TOKEN is set but not valid for gh" "unset GITHUB_TOKEN, then re-run ./setup.sh"
  info "signing into GitHub"
  gh auth login -w
  gh auth status >/dev/null 2>&1 || fail "gh login did not complete"
fi
ok "GitHub CLI authenticated"

gh_repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner) \
  || fail "not inside a GitHub repo" "push this repo to GitHub first"
ok "target repo: $gh_repo"

oidc_provider_arn="arn:aws:iam::${account_id}:oidc-provider/token.actions.githubusercontent.com"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$oidc_provider_arn" >/dev/null 2>&1; then
  ok "GitHub OIDC provider exists"
else
  quiet aws iam create-open-id-connect-provider --url "https://token.actions.githubusercontent.com" \
    --client-id-list "sts.amazonaws.com" --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" \
    || fail "could not create the GitHub OIDC provider"
  ok "created the GitHub OIDC provider"
fi

owner="${gh_repo%%/*}"
repo_name="${gh_repo##*/}"
owner_id=$(gh api "repos/${gh_repo}" --jq '.owner.id')
repo_id=$(gh api "repos/${gh_repo}" --jq '.id')
# Bind the role to this exact repo by numeric owner/repo id, not just the name.
sub_pattern="repo:${owner}@${owner_id}/${repo_name}@${repo_id}:*"
role_name="furnace-gha-deploy"

trust_policy=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "$oidc_provider_arn" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike": { "token.actions.githubusercontent.com:sub": "${sub_pattern}" }
    }
  }]
}
JSON
)
if aws iam get-role --role-name "$role_name" >/dev/null 2>&1; then
  quiet aws iam update-assume-role-policy --role-name "$role_name" --policy-document "$trust_policy" \
    || fail "could not update the deploy role trust policy"
  ok "deploy role trust policy updated"
else
  quiet aws iam create-role --role-name "$role_name" --assume-role-policy-document "$trust_policy" \
    || fail "could not create the deploy role"
  ok "created the deploy role"
fi

deploy_policy='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["ec2:*","autoscaling:*","lambda:*","ssm:*","iam:*","s3:*"],"Resource":"*"}]}'
quiet aws iam put-role-policy --role-name "$role_name" --policy-name "deploy" --policy-document "$deploy_policy" \
  || fail "could not attach the deploy permissions"
ok "deploy role permissions set"

quiet gh variable set AWS_ACCOUNT_ID --repo "$gh_repo" --body "$account_id" || fail "could not set AWS_ACCOUNT_ID"
printf '%s' "$PULUMI_CONFIG_PASSPHRASE" | quiet gh secret set PULUMI_CONFIG_PASSPHRASE --repo "$gh_repo" || fail "could not set PULUMI_CONFIG_PASSPHRASE"
printf '%s' "$api_key" | quiet gh secret set API_KEY --repo "$gh_repo" || fail "could not set API_KEY"
printf '%s' "$(env_get GROQ_API_KEY)" | quiet gh secret set GROQ_API_KEY --repo "$gh_repo" || fail "could not set GROQ_API_KEY"
ok "CI secrets set (AWS_ACCOUNT_ID, PULUMI_CONFIG_PASSPHRASE, API_KEY, GROQ_API_KEY)"

quiet pulumi config set agentGitUrl "https://github.com/${gh_repo}.git" || fail "could not set agentGitUrl"
ok "agent git URL set to https://github.com/${gh_repo}.git"
