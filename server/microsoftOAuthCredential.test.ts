import { describe, expect, it } from "vitest";

describe("Microsoft Entra client credential", () => {
  it("is accepted for an invalid-code probe without accessing Outlook data", async () => {
    const tenantId = process.env.MICROSOFT_TENANT_ID;
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

    expect(tenantId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(clientId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(clientSecret).toBeTruthy();

    const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        grant_type: "authorization_code",
        code: "credential-validation-probe",
        redirect_uri: "https://stephtodo-hbslvcim.manus.space/api/integrations/microsoft/callback",
      }),
    });
    const body = await response.json() as { error?: string; error_description?: string };

    // A known-invalid authorisation code must be rejected after client authentication.
    // This proves the client configuration without issuing a token or reading Outlook data.
    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_grant");
    expect(body.error_description).not.toContain("AADSTS7000215");
  }, 20_000);
});
