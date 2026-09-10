#!/usr/bin/env bash
# Times one lease -> ssh-ready -> release cycle against the deployed stack.
set -euo pipefail
cd "$(dirname "$0")"

export PULUMI_CONFIG_PASSPHRASE="${PULUMI_CONFIG_PASSPHRASE:-$(cat .pulumi-passphrase)}"
url=$(pulumi stack output brokerUrl)
key=$(pulumi config get apiKey)

t0=$(date +%s)
resp=$(curl -sf -X POST "${url}lease" -H "x-api-key: ${key}")
id=$(echo "$resp" | jq -r .instanceId)
ip=$(echo "$resp" | jq -r .publicIp)
echo "$resp" | jq -r .sshKey > bench-key.pem && chmod 600 bench-key.pem
printf 'lease returned      %3ds\n' "$(( $(date +%s) - t0 ))"

t1=$(date +%s)
until ssh -i bench-key.pem -o StrictHostKeyChecking=no -o ConnectTimeout=5 "ec2-user@$ip" true 2>/dev/null; do
  sleep 5
done
printf 'ssh reachable       %3ds\n' "$(( $(date +%s) - t1 ))"

t2=$(date +%s)
curl -sf -X POST "${url}release" -H "x-api-key: ${key}" -d "{\"instanceId\": \"$id\"}" > /dev/null
printf 'release returned    %3ds\n' "$(( $(date +%s) - t2 ))"
rm -f bench-key.pem
