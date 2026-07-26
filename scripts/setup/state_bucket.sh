#!/usr/bin/env bash

bucket="vm-service-pulumi-state-${account_id}"

# create the Pulumi state bucket if it doesn't exist.
if quiet aws s3api head-bucket --bucket "$bucket"; then
  ok "state bucket $bucket already exists"
else
  if [ "$region" = "us-east-1" ]; then
    quiet aws s3api create-bucket --bucket "$bucket" --region "$region" \
      || fail "failed to create state bucket" "see error output below"
  else
    quiet aws s3api create-bucket --bucket "$bucket" --region "$region" \
      --create-bucket-configuration "LocationConstraint=$region" \
      || fail "failed to create state bucket" "see error output below"
  fi

  # set the S3 bucket to be versioned + no public access.
  quiet aws s3api put-bucket-versioning --bucket "$bucket" --versioning-configuration Status=Enabled \
    || fail "failed to enable bucket versioning" "see error output below"
  quiet aws s3api put-public-access-block --bucket "$bucket" --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
    || fail "failed to lock down bucket access" "see error output below"
  ok "created state bucket $bucket"
fi
