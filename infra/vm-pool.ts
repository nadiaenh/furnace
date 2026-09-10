import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";
import { subnets, ami, vmSecurityGroup } from "./networking";

const config = new pulumi.Config();
const dockerImage = config.get("dockerImage") ?? "bkimminich/juice-shop";
const agentGitUrl = config.get("agentGitUrl") ?? "https://github.com/nadiaenh/vm-service.git";
const groqApiKey = config.requireSecret("groqApiKey");

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

const userData = pulumi.all([dockerImage, groqApiKeyParam.name, agentGitUrl]).apply(
  ([image, groqParamName, gitUrl]) =>
    Buffer.from(
      [
        "#!/bin/bash",
        "dnf install -y docker git",
        "systemctl enable --now docker",
        "mkdir -p /opt/reports",
        "docker run -d --restart unless-stopped --name report-server -p 8081:8081 -v /opt/reports:/usr/share/nginx/html:ro nginx:alpine sh -c \"sed -i 's/listen *80;/listen 8081;/' /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'\"",
        `git clone --depth 1 ${gitUrl} /opt/vm-service`,
        "docker build -t vm-service-agent:latest /opt/vm-service/agent",
        `GROQ_API_KEY=$(aws ssm get-parameter --name "${groqParamName}" --with-decryption --query Parameter.Value --output text --region $(curl -s http://169.254.169.254/latest/meta-data/placement/region))`,
        "docker network create juicenet || true",
        `docker run -d --restart unless-stopped --network juicenet -p 8080:3000 --name juice-shop ${image}`,
        `docker run -d --restart unless-stopped --network juicenet --name agent -e TARGET_URL=http://juice-shop:3000 -e GROQ_API_KEY="$GROQ_API_KEY" -e REPORT_PATH=/reports/report.html -v /opt/reports:/reports vm-service-agent:latest`,
      ].join("\n"),
    ).toString("base64"),
);

const launchTemplate = new aws.ec2.LaunchTemplate("vm", {
  imageId: ami.value,
  instanceType: "t3.micro",
  keyName: keyPair.keyName,
  vpcSecurityGroupIds: [vmSecurityGroup.id],
  iamInstanceProfile: { arn: vmInstanceProfile.arn },
  userData: userData,
});

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

export const leaseTtlMinutes = config.getNumber("leaseTtlMinutes") ?? 60;
