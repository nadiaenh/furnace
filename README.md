<p align="center"> 
<img src="https://img.shields.io/badge/Pulumi-8A3391?logo=pulumi&logoColor=white" alt="Pulumi"> <img src="https://custom-icon-badges.demolab.com/badge/AWS-%23FF9900.svg?logo=aws&logoColor=white" alt="AWS EC2 and Lambda"> <a href=".github/workflows/deploy.yml"><img src="https://github.com/nadiaenh/furnace/actions/workflows/deploy.yml/badge.svg" alt="Deploy"></a> <a href=".github/workflows/lease.yml"><img src="https://github.com/nadiaenh/furnace/actions/workflows/lease.yml/badge.svg" alt="Lease check"></a>
</p>

**furnace** is an AWS-based Pulumi-self-hosted VM rental service meant to be served on the public internet (unlike [cinders](https://github.com/nadiaenh/cinders/tree/main)).

<p align="center"><img width="250" src="https://opengameart.org/sites/default/files/styles/medium/public/blacksmith-preview-optimized.gif" alt="A pixel art animation of a furnace"></p>

## Setup

```sh
git clone git@github.com:nadiaenh/furnace.git
cd furnace
./setup.sh

# Deploy to your AWS account.
export PULUMI_CONFIG_PASSPHRASE=$(cat .pulumi-passphrase)
pulumi up
```

## Usage

```sh
export PULUMI_CONFIG_PASSPHRASE=$(cat .pulumi-passphrase)
url=$(pulumi stack output brokerUrl)
key=$(pulumi config get apiKey)

# Lease an instance.
resp=$(curl -sX POST "${url}lease" -H "x-api-key: ${key}")
# -> { "instanceId": "i-...", "publicIp": "...", "sshKey": "-----BEGIN..." }

# Save the key and SSH in.
key_file=$(mktemp)
echo "$resp" | jq -r .sshKey > "$key_file" && chmod 600 "$key_file"
ssh -i "$key_file" "ec2-user@$(echo "$resp" | jq -r .publicIp)"

# The default workload answers on port 8080.
curl "http://$(echo "$resp" | jq -r .publicIp):8080"

# Release when done.
curl -sX POST "${url}release" -H "x-api-key: ${key}" \
  -d "{\"instanceId\": \"$(echo "$resp" | jq -r .instanceId)\"}"

# Set a different workload to run.
pulumi config set dockerImage <image>
```

## Demo

![Lease a VM, SSH in, release it](assets/demo.svg)
