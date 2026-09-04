import type { Express, Request, Response } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { completeMicrosoftAuthorization, MICROSOFT_REDIRECT_URI, MICROSOFT_SCOPES } from "./microsoftIntegration";

const STATE_COOKIE = "microsoft_oauth_state";

function cookieOptions() {
  return {
    httpOnly: true,
    secure: ENV.isProduction,
    sameSite: "lax" as const,
    path: "/api/integrations/microsoft",
    maxAge: 10 * 60 * 1000,
  };
}

async function requireAdmin(req: Request) {
  const user = await sdk.authenticateRequest(req);
  if (!user || user.role !== "admin") throw new Error("UNAUTHORIZED");
  return user;
}

function safeStateMatch(expected: string, received: string) {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function redirectWithStatus(res: Response, status: "connected" | "error") {
  return res.redirect(`/?outlook=${status}`);
}

export function registerMicrosoftOAuthRoutes(app: Express) {
  app.get("/api/integrations/microsoft/start", async (req, res) => {
    try {
      const user = await requireAdmin(req);
      if (!ENV.microsoftTenantId || !ENV.microsoftClientId || !ENV.microsoftClientSecret) {
        return res.status(503).send("Microsoft Outlook is not configured.");
      }
      const state = `${user.id}.${randomBytes(32).toString("base64url")}`;
      res.cookie(STATE_COOKIE, state, cookieOptions());
      const query = new URLSearchParams({
        client_id: ENV.microsoftClientId,
        response_type: "code",
        redirect_uri: MICROSOFT_REDIRECT_URI,
        response_mode: "query",
        scope: MICROSOFT_SCOPES.join(" "),
        state,
        prompt: "select_account",
      });
      return res.redirect(`https://login.microsoftonline.com/${ENV.microsoftTenantId}/oauth2/v2.0/authorize?${query.toString()}`);
    } catch {
      return res.status(401).send("Sign in as the dashboard owner before connecting Outlook.");
    }
  });

  app.get("/api/integrations/microsoft/callback", async (req, res) => {
    const receivedState = typeof req.query.state === "string" ? req.query.state : "";
    const expectedState = parseCookieHeader(req.headers.cookie ?? "")[STATE_COOKIE] ?? "";
    res.clearCookie(STATE_COOKIE, cookieOptions());
    if (!receivedState || !expectedState || !safeStateMatch(expectedState, receivedState)) return redirectWithStatus(res, "error");
    const [userIdString] = receivedState.split(".");
    const userId = Number(userIdString);
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!Number.isInteger(userId) || !code) return redirectWithStatus(res, "error");
    try {
      await completeMicrosoftAuthorization(userId, code);
      return redirectWithStatus(res, "connected");
    } catch (error) {
      console.error("[Microsoft OAuth] Callback failed", error);
      return redirectWithStatus(res, "error");
    }
  });
}
