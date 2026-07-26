import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";
import { subnets, ami, vmSecurityGroup } from "./networking";

const config = new pulumi.Config();
const dockerImage = config.get("dockerImage") ?? "nginx:alpine";

// create keypair for SSH access to the VM.
const sshKey = new tls.PrivateKey("ssh-key", { algorithm: "ED25519" });
const keyPair = new aws.ec2.KeyPair("vm-keypair", {
  publicKey: sshKey.publicKeyOpenssh,
});
export const sshKeyParam = new aws.ssm.Parameter("ssh-key-param", {
  type: "SecureString",
  value: sshKey.privateKeyOpenssh,
});

// start Docker and run the container on port 8080.
const userData = Buffer.from(
  [
    "#!/bin/bash",
    "dnf install -y docker",
    "systemctl enable --now docker",
    `docker run -d --restart unless-stopped -p 8080:80 ${dockerImage}`,
  ].join("\n"),
).toString("base64");

const launchTemplate = new aws.ec2.LaunchTemplate("vm", {
  imageId: ami.value,
  instanceType: "t3.micro",
  keyName: keyPair.keyName,
  vpcSecurityGroupIds: [vmSecurityGroup.id],
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
