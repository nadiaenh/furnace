#!/usr/bin/env bash

# derive the target repo from the authenticated gh user.
gh_user=$(gh api user --jq '.login') || fail "failed to determine github user" "make sure gh cli is authenticated"
gh_repo="${gh_user}/vm-service"
quiet gh repo view "$gh_repo" \
  || fail "repo $gh_repo not found on github (or no access)" "create it first (gh repo create $gh_repo --private) or check the name"
ok "repo $gh_repo exists on github"

# create the OIDC provider so GitHub Actions can assume an AWS role without long-lived keys.
oidc_provider_arn="arn:aws:iam::${account_id}:oidc-provider/token.actions.githubusercontent.com"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$oidc_provider_arn" >/dev/null 2>&1; then
  ok "github oidc provider already exists"
else
  quiet aws iam create-open-id-connect-provider \
    --url "https://token.actions.githubusercontent.com" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" \
    || fail "failed to create github oidc provider" "see error output below"
  ok "created github oidc provider"
fi

# create or update the deploy role.
owner="${gh_repo%%/*}"
repo_name="${gh_repo##*/}"
owner_id=$(gh api "repos/${gh_repo}" --jq '.owner.id')
repo_id=$(gh api "repos/${gh_repo}" --jq '.id')
sub_pattern="repo:${owner}@${owner_id}/${repo_name}@${repo_id}:*"

role_name="vm-service-gha-deploy"
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
    || fail "failed to update gha role trust policy" "see error output below"
  ok "gha deploy role already exists, trust policy updated"
else
  quiet aws iam create-role --role-name "$role_name" --assume-role-policy-document "$trust_policy" \
    || fail "failed to create gha deploy role" "see error output below"
  ok "created gha deploy role"
fi

# grant the role permissions to deploy the Pulumi stack.
deploy_policy=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["ec2:*", "autoscaling:*", "lambda:*", "ssm:*", "iam:*", "s3:*"], "Resource": "*" }
  ]
}
JSON
)
quiet aws iam put-role-policy --role-name "$role_name" --policy-name "deploy" --policy-document "$deploy_policy" \
  || fail "failed to attach gha deploy permissions" "see error output below"
ok "gha deploy role permissions set"

# set the repo secrets for GitHub CI/CD.
role_arn=$(aws iam get-role --role-name "$role_name" --query Role.Arn --output text)
quiet gh secret set AWS_ROLE_ARN --repo "$gh_repo" --body "$role_arn" || fail "failed to set AWS_ROLE_ARN secret" "see error output below"
quiet gh secret set PULUMI_CONFIG_PASSPHRASE --repo "$gh_repo" --body "$PULUMI_CONFIG_PASSPHRASE" || fail "failed to set PULUMI_CONFIG_PASSPHRASE secret" "see error output below"
quiet gh secret set API_KEY --repo "$gh_repo" --body "$api_key" || fail "failed to set API_KEY secret" "see error output below"
ok "github repo secrets set (AWS_ROLE_ARN, PULUMI_CONFIG_PASSPHRASE, API_KEY)"
