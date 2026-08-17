import { describe, expect, it } from "vitest";

describe("Expo build authentication", () => {
  it("authenticates the configured temporary Expo access token", async () => {
    const token = process.env.EXPO_TOKEN;
    expect(token, "EXPO_TOKEN must be available to the build workspace").toBeTruthy();

    const response = await fetch("https://api.expo.dev/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "query { me { id username } }" }),
    });

    expect(response.ok, `Expo authentication returned HTTP ${response.status}`).toBe(true);
    const payload = await response.json() as { data?: { me?: { id?: string } } };
    expect(payload.data?.me?.id, "Expo did not return an authenticated account").toBeTruthy();
  });
});
