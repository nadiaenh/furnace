import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { vmPool, sshKeyParam, leaseTtlMinutes } from "./vm-pool";

const config = new pulumi.Config();
const apiKey = config.requireSecret("apiKey");

// tracks which instances are currently leased.
const leaseBucket = new aws.s3.BucketV2("leases", { forceDestroy: true });

// give Lambda permission to assume broker-role.
const brokerRole = new aws.iam.Role("broker-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
});

// give broker basic Lambda execution permissions.
new aws.iam.RolePolicyAttachment("broker-logs", {
  role: brokerRole.name,
  policyArn: aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
});

// give broker autoscaling + EC2 + S3 + SSM permissions.
new aws.iam.RolePolicy("broker-policy", {
  role: brokerRole.id,
  policy: pulumi.jsonStringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: [
          "autoscaling:DescribeAutoScalingGroups",
          "autoscaling:SetInstanceProtection",
          "ec2:DescribeInstances",
        ],
        Resource: "*",
      },
      {
        Effect: "Allow",
        Action: [
          "s3:ListBucket",
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ],
        Resource: [leaseBucket.arn, pulumi.interpolate`${leaseBucket.arn}/*`],
      },
      {
        Effect: "Allow",
        Action: "ssm:GetParameter",
        Resource: sshKeyParam.arn,
      },
    ],
  }),
});

// the lease/release api.
const broker = new aws.lambda.Function("broker", {
  runtime: aws.lambda.Runtime.NodeJS20dX,
  handler: "handler.handler",
  code: new pulumi.asset.FileArchive("./broker"),
  role: brokerRole.arn,
  timeout: 15,
  environment: {
    variables: {
      API_KEY: apiKey,
      ASG_NAME: vmPool.name,
      LEASE_BUCKET: leaseBucket.bucket,
      SSH_KEY_PARAM: sshKeyParam.name,
      LEASE_TTL_MINUTES: String(leaseTtlMinutes),
    },
  },
});

export const brokerFunctionUrl = new aws.lambda.FunctionUrl("broker-url", {
  functionName: broker.name,
  authorizationType: "NONE",
});

new aws.lambda.Permission("broker-url-public", {
  action: "lambda:InvokeFunctionUrl",
  function: broker.name,
  principal: "*",
  functionUrlAuthType: "NONE",
});
