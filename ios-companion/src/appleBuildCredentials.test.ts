import { describe, expect, it } from "vitest";

describe("Apple build credential preflight", () => {
  it("accepts securely supplied Apple app-specific credentials and reaches the authenticated Expo build service", async () => {
    const appleId = process.env.EXPO_APPLE_ID;
    const appPassword = process.env.EXPO_APPLE_PASSWORD;
    const expoToken = process.env.EXPO_TOKEN;

    expect(appleId, "EXPO_APPLE_ID must be available to the build workspace").toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    expect(appPassword, "EXPO_APPLE_PASSWORD must be a non-empty app-specific password").toMatch(/^[A-Za-z0-9-]{12,}$/);
    expect(expoToken, "EXPO_TOKEN must be available to authenticate the Expo build service").toBeTruthy();

    const response = await fetch("https://api.expo.dev/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${expoToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "query { me { id username } }" }),
    });
    expect(response.ok, `Expo build service returned HTTP ${response.status}`).toBe(true);
    const payload = await response.json() as { data?: { me?: { id?: string } } };
    expect(payload.data?.me?.id).toBeTruthy();
  });
});
