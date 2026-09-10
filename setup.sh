#!/usr/bin/env bash
cd "$(dirname "$0")"
source scripts/common.sh

region="${AWS_REGION:-us-west-2}"
stack="dev"

step "1. Install tools"
source scripts/homebrew.sh

step "2. AWS"
source scripts/aws.sh

step "3. Agent credentials"
source scripts/env.sh

step "4. Pulumi stack"
source scripts/pulumi.sh

step "5. GitHub CI"
source scripts/github.sh

step "Setup complete"
echo "  export PULUMI_CONFIG_PASSPHRASE=\$(cat .pulumi-passphrase)"
echo "  pulumi up          # or push to main to deploy through CI"
