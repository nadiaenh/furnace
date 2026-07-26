# vm-service

Autoscaled pool of dockerized EC2 VMs, leasable via an authenticated Lambda broker. Pulumi state is self-hosted in S3.

[![deploy](https://github.com/nadiaenh/vm-service/actions/workflows/deploy.yml/badge.svg)](https://github.com/nadiaenh/vm-service/actions/workflows/deploy.yml)

## Prerequisites

- macOS with [Homebrew](https://brew.sh)
- a GitHub repo to push this to

Everything else (AWS CLI + auth, Pulumi CLI, Node, pnpm, gh CLI + auth) is installed and configured by `setup.sh`.

## Setup

```sh
./setup.sh
```

This bootstraps everything needed to deploy. You will only be prompted to manually provide:

1. `aws login` if not already logged in.
2. the GitHub repo name (`owner/repo`)
3. GitHub CLI browser sign-in, if not already logged in
4. a Pulumi passphrase of your choice, if `.pulumi-passphrase` doesn't exist yet

## Deploy

```sh
# refresh AWS credentials if needed.
aws sts get-caller-identity >/dev/null 2>&1 || echo "run: aws login"

# get Pulumi passphrase used to encrypt state in S3.
export PULUMI_CONFIG_PASSPHRASE=$(cat .pulumi-passphrase)

# deploy.
pulumi up
```

## Use

```sh
url=$(pulumi stack output brokerUrl)
key=$(pulumi config get apiKey)

resp=$(curl -sX POST "${url}lease" -H "x-api-key: ${key}")
# -> { "instanceId": "i-...", "publicIp": "...", "sshKey": "..." }

# export SSH key into file.
key_file=$(mktemp)
echo "$resp" | jq -r .sshKey > "$key_file"
chmod 600 "$key_file"

# SSH into your leased instance using SSH key + instance public IP.
ssh -i "$key_file" "ec2-user@$(echo "$resp" | jq -r .publicIp)"
```

Release when done:

```sh
curl -sX POST "${url}release" -H "x-api-key: ${key}" -d "{\"instanceId\": \"$(echo "$resp" | jq -r .instanceId)\"}"
```

The workload container listens on port 8080 (`curl http://<publicIp>:8080`).

## Tear down

```sh
pulumi destroy
```
