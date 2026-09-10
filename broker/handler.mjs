import { authorized } from "./auth.mjs";
import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
  SetInstanceProtectionCommand,
} from "@aws-sdk/client-auto-scaling";
import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const asgClient = new AutoScalingClient();
const ec2Client = new EC2Client();
const s3Client = new S3Client();
const ssmClient = new SSMClient();

const { API_KEY, ASG_NAME, LEASE_BUCKET, SSH_KEY_PARAM } = process.env;
const LEASE_TTL_MS = Number(process.env.LEASE_TTL_MINUTES ?? "60") * 60 * 1000;
const LEASE_PREFIX = "leases/";

const respond = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  if (!authorized(event.headers?.["x-api-key"], API_KEY)) {
    return respond(401, { error: "unauthorized" });
  }
  const method = event.requestContext.http.method;
  const path = event.rawPath;
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64").toString()
    : event.body;
  try {
    if (method === "POST" && path === "/lease") return await lease();
    if (method === "POST" && path === "/release")
      return await release(JSON.parse(rawBody ?? "{}"));
    return respond(404, { error: "not found" });
  } catch (err) {
    console.error(err);
    return respond(500, { error: err.message });
  }
};

async function inServiceInstanceIds() {
  const { AutoScalingGroups } = await asgClient.send(
    new DescribeAutoScalingGroupsCommand({ AutoScalingGroupNames: [ASG_NAME] }),
  );
  return (AutoScalingGroups[0]?.Instances ?? [])
    .filter((i) => i.LifecycleState === "InService")
    .map((i) => i.InstanceId);
}

async function listLeases() {
  const { Contents } = await s3Client.send(
    new ListObjectsV2Command({ Bucket: LEASE_BUCKET, Prefix: LEASE_PREFIX }),
  );
  return (Contents ?? []).map((o) => ({
    instanceId: o.Key.slice(LEASE_PREFIX.length),
    key: o.Key,
    lastModified: o.LastModified,
  }));
}

async function deleteLease(instanceId) {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: LEASE_BUCKET,
      Key: `${LEASE_PREFIX}${instanceId}`,
    }),
  );
}

async function setProtection(instanceId, on) {
  try {
    await asgClient.send(
      new SetInstanceProtectionCommand({
        AutoScalingGroupName: ASG_NAME,
        InstanceIds: [instanceId],
        ProtectedFromScaleIn: on,
      }),
    );
  } catch (err) {
    console.warn(`setProtection(${instanceId}, ${on}) failed: ${err.message}`);
  }
}

async function tryClaim(instanceId) {
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: LEASE_BUCKET,
        Key: `${LEASE_PREFIX}${instanceId}`,
        Body: JSON.stringify({ leasedAt: new Date().toISOString() }),
        IfNoneMatch: "*",
      }),
    );
    return true;
  } catch (err) {
    if (
      err.name === "PreconditionFailed" ||
      err.$metadata?.httpStatusCode === 412
    )
      return false;
    throw err;
  }
}

async function lease() {
  const instanceIds = await inServiceInstanceIds();
  if (instanceIds.length === 0)
    return respond(503, { error: "no instances in service" });

  const inService = new Set(instanceIds);
  const now = Date.now();
  const leases = await listLeases();
  const activeLeases = new Set();
  for (const l of leases) {
    if (!inService.has(l.instanceId)) {
      await deleteLease(l.instanceId);
    } else if (now - l.lastModified.getTime() > LEASE_TTL_MS) {
      await setProtection(l.instanceId, false);
      await deleteLease(l.instanceId);
    } else {
      activeLeases.add(l.instanceId);
    }
  }

  let claimedId = null;
  for (const id of instanceIds) {
    if (activeLeases.has(id)) continue;
    if (await tryClaim(id)) {
      claimedId = id;
      break;
    }
  }
  if (!claimedId) return respond(409, { error: "all instances leased" });

  await setProtection(claimedId, true);
  const { Reservations } = await ec2Client.send(
    new DescribeInstancesCommand({ InstanceIds: [claimedId] }),
  );
  const publicIp = Reservations[0]?.Instances?.[0]?.PublicIpAddress;
  const { Parameter } = await ssmClient.send(
    new GetParameterCommand({ Name: SSH_KEY_PARAM, WithDecryption: true }),
  );
  return respond(200, {
    instanceId: claimedId,
    publicIp,
    sshKey: Parameter.Value,
  });
}

async function release({ instanceId }) {
  if (!instanceId) return respond(400, { error: "instanceId required" });
  await setProtection(instanceId, false);
  await deleteLease(instanceId);
  return respond(200, { released: instanceId });
}
