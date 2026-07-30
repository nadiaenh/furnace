import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";
import { subnets, ami, vmSecurityGroup } from "./networking";

const config = new pulumi.Config();
const dockerImage = config.get("dockerImage") ?? "bkimminich/juice-shop";
const groqApiKey = config.requireSecret("groqApiKey");

// create keypair for SSH access to the VM.
const sshKey = new tls.PrivateKey("ssh-key", { algorithm: "ED25519" });
const keyPair = new aws.ec2.KeyPair("vm-keypair", {
  publicKey: sshKey.publicKeyOpenssh,
});
export const sshKeyParam = new aws.ssm.Parameter("ssh-key-param", {
  type: "SecureString",
  value: sshKey.privateKeyOpenssh,
});

export const groqApiKeyParam = new aws.ssm.Parameter("groq-api-key-param", {
  type: "SecureString",
  value: groqApiKey,
});

const vmRole = new aws.iam.Role("vm-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "ec2.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  }),
});

new aws.iam.RolePolicy("vm-role-policy", {
  role: vmRole.id,
  policy: pulumi.jsonStringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "ssm:GetParameter",
        Resource: groqApiKeyParam.arn,
      },
    ],
  }),
});

const vmInstanceProfile = new aws.iam.InstanceProfile("vm-instance-profile", {
  role: vmRole.name,
});

const userData = Buffer.from(
  [
    "#!/bin/bash",
    "dnf install -y docker",
    "systemctl enable --now docker",
    "mkdir -p /opt/reports",
    `docker run -d --restart unless-stopped -p 8080:3000 ${dockerImage}`,
    "docker run -d --restart unless-stopped --name report-server -p 8081:8081 -v /opt/reports:/usr/share/nginx/html:ro nginx:alpine sh -c \"sed -i 's/listen *80;/listen 8081;/' /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'\"",
  ].join("\n"),
).toString("base64");

const launchTemplate = new aws.ec2.LaunchTemplate("vm", {
  imageId: ami.value,
  instanceType: "t3.micro",
  keyName: keyPair.keyName,
  vpcSecurityGroupIds: [vmSecurityGroup.id],
  iamInstanceProfile: { arn: vmInstanceProfile.arn },
  userData: userData,
});

// autoscale the VM pool.
export const vmPool = new aws.autoscaling.Group("vm-pool", {
  minSize: 1,
  maxSize: 3,
  desiredCapacity: 2,
  vpcZoneIdentifiers: subnets.ids,
  launchTemplate: { id: launchTemplate.id, version: "$Latest" },
  tags: [{ key: "Name", value: "vm-service-worker", propagateAtLaunch: true }],
});

new aws.autoscaling.Policy("vm-pool-cpu-scaling", {
  autoscalingGroupName: vmPool.name,
  policyType: "TargetTrackingScaling",
  targetTrackingConfiguration: {
    predefinedMetricSpecification: {
      predefinedMetricType: "ASGAverageCPUUtilization",
    },
    targetValue: 70,
  },
});

// broker will reclaim an instance after 60 minutes.
export const leaseTtlMinutes = config.getNumber("leaseTtlMinutes") ?? 60;
