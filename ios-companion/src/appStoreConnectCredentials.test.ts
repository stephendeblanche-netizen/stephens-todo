import { importPKCS8, SignJWT } from "jose";
import { describe, expect, it } from "vitest";

describe("App Store Connect API key", () => {
  it("authenticates a lightweight apps request with the configured key", async () => {
    const keyId = process.env.APP_STORE_CONNECT_KEY_ID;
    const issuerId = process.env.APP_STORE_CONNECT_ISSUER_ID;
    const configuredPrivateKey = process.env.APP_STORE_CONNECT_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
    const rawPrivateKey = configuredPrivateKey?.includes("BEGIN PRIVATE KEY")
      ? configuredPrivateKey
      : configuredPrivateKey
        ? `-----BEGIN PRIVATE KEY-----\n${configuredPrivateKey.match(/.{1,64}/g)?.join("\n")}\n-----END PRIVATE KEY-----`
        : undefined;

    expect(keyId, "APP_STORE_CONNECT_KEY_ID must be configured").toMatch(/^[A-Za-z0-9]+$/);
    expect(issuerId, "APP_STORE_CONNECT_ISSUER_ID must be configured").toMatch(/^[0-9a-f-]{36}$/i);
    expect(rawPrivateKey, "APP_STORE_CONNECT_PRIVATE_KEY must contain the downloaded .p8 key body").toContain("BEGIN PRIVATE KEY");

    const privateKey = await importPKCS8(rawPrivateKey!, "ES256");
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: keyId!, typ: "JWT" })
      .setIssuer(issuerId!)
      .setAudience("appstoreconnect-v1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    const response = await fetch("https://api.appstoreconnect.apple.com/v1/apps?limit=1", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok, `App Store Connect returned HTTP ${response.status}`).toBe(true);
  });
});
