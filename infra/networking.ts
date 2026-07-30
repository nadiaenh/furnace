import * as aws from "@pulumi/aws";

// set a default VPC and its subnets.
export const vpc = aws.ec2.getVpcOutput({ default: true });
export const subnets = aws.ec2.getSubnetsOutput({
  filters: [{ name: "vpc-id", values: [vpc.id] }],
});

// latest Amazon Linux 2023 for the launch template.
export const ami = aws.ssm.getParameterOutput({
  name: "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64",
});

// allow SSH and HTTP access to the VM + all outbound traffic.
export const vmSecurityGroup = new aws.ec2.SecurityGroup("vm-sg", {
  vpcId: vpc.id,
  ingress: [
    { protocol: "tcp", fromPort: 22, toPort: 22, cidrBlocks: ["0.0.0.0/0"] },
    {
      protocol: "tcp",
      fromPort: 8080,
      toPort: 8080,
      cidrBlocks: ["0.0.0.0/0"],
    },
    {
      protocol: "tcp",
      fromPort: 8081,
      toPort: 8081,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  egress: [
    { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
  ],
});
