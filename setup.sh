#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
trap 'echo "setup aborted (see above for what failed)." >&2' ERR

region="${AWS_REGION:-us-west-2}"
stack="dev"

source scripts/setup/common.sh
source scripts/setup/homebrew.sh
source scripts/setup/aws_cli.sh
source scripts/setup/aws_auth.sh
source scripts/setup/pulumi_cli.sh
source scripts/setup/tooling.sh
source scripts/setup/state_bucket.sh
source scripts/setup/pulumi_stack.sh
source scripts/setup/gh_cli.sh
source scripts/setup/gh_auth.sh
source scripts/setup/gh_ci.sh

echo
echo "setup complete. deploy with:"
echo "  export PULUMI_CONFIG_PASSPHRASE=\$(cat $passphrase_file)"
echo "  pulumi up"
echo "or push to main to deploy via CI"
