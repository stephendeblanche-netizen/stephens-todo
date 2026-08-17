import { connect } from "node:http2";
import { importPKCS8, SignJWT } from "jose";
import { describe, expect, it } from "vitest";

const teamId = "7W2RL4DS2B";
const topic = "com.stephendeblanche.stephenstodo";

function toPem(value: string) {
  const normalized = value.trim().replace(/\\n/g, "\n");
  if (normalized.includes("BEGIN PRIVATE KEY")) return normalized;
  return `-----BEGIN PRIVATE KEY-----\n${normalized.replace(/\s/g, "").match(/.{1,64}/g)?.join("\n")}\n-----END PRIVATE KEY-----`;
}

function apnsProbe(token: string, host = "https://api.push.apple.com") {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const session = connect(host);
    session.once("error", reject);
    const request = session.request({
      ":method": "POST",
      ":path": "/3/device/0000000000000000000000000000000000000000000000000000000000000000",
      authorization: `bearer ${token}`,
      "apns-topic": topic,
      "apns-push-type": "background",
      "apns-priority": "5",
    });
    request.once("response", (headers) => {
      const status = Number(headers[":status"]);
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += chunk; });
      request.once("end", () => {
        session.close();
        resolve({ status, body });
      });
    });
    request.once("error", (error) => {
      session.close();
      reject(error);
    });
    request.end("{}");
  });
}

describe("APNs authentication key", () => {
  it("authenticates against APNs without delivering a notification", async () => {
    const keyId = process.env.APNS_KEY_ID;
    const privateKey = process.env.APNS_AUTH_KEY;
    expect(keyId).toBeTruthy();
    expect(privateKey).toBeTruthy();

    const signer = await importPKCS8(toPem(privateKey!), "ES256");
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: keyId! })
      .setIssuer(teamId)
      .setIssuedAt()
      .sign(signer);

    const production = await apnsProbe(token);
    const sandbox = await apnsProbe(token, "https://api.sandbox.push.apple.com");
    expect([400, 410], `Production: ${production.body}; Sandbox: ${sandbox.body}`).toContain(production.status);
  }, 20_000);
});
