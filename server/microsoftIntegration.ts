import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import {
  createMicrosoftEmailImport,
  createTask,
  getMicrosoftConnection,
  getMicrosoftEmailImport,
  getMicrosoftTaskEvent,
  getTaskById,
  getTasksByCategory,
  updateTask,
  upsertMicrosoftConnection,
  upsertMicrosoftTaskEvent,
} from "./db";
import { ENV } from "./_core/env";

export const MICROSOFT_REDIRECT_URI = "https://stephtodo-hbslvcim.manus.space/api/integrations/microsoft/callback";
export const MICROSOFT_SCOPES = ["openid", "profile", "email", "offline_access", "User.Read", "Calendars.ReadWrite", "Mail.Read"];

type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type MicrosoftTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
};

type MicrosoftProfile = {
  id?: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
};

function requireMicrosoftConfiguration() {
  if (!ENV.microsoftTenantId || !ENV.microsoftClientId || !ENV.microsoftClientSecret) {
    throw new Error("Microsoft Outlook connection is not configured.");
  }
}

function encryptionKey() {
  if (!ENV.cookieSecret) throw new Error("Server encryption key is unavailable.");
  return createHash("sha256").update(ENV.cookieSecret).digest();
}

export function encryptMicrosoftTokens(tokens: StoredTokens) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptMicrosoftTokens(ciphertext: string): StoredTokens {
  const [ivEncoded, tagEncoded, encryptedEncoded] = ciphertext.split(".");
  if (!ivEncoded || !tagEncoded || !encryptedEncoded) throw new Error("Stored Microsoft connection is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(encryptedEncoded, "base64url")), decipher.final()]).toString("utf8");
  const parsed = JSON.parse(plaintext) as StoredTokens;
  if (!parsed.accessToken || !parsed.refreshToken || !Number.isFinite(parsed.expiresAt)) {
    throw new Error("Stored Microsoft connection is incomplete.");
  }
  return parsed;
}

async function tokenRequest(params: Record<string, string>) {
  requireMicrosoftConfiguration();
  const response = await fetch(`https://login.microsoftonline.com/${ENV.microsoftTenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = await response.json() as MicrosoftTokenResponse;
  if (!response.ok || !body.access_token) throw new Error("Microsoft could not complete the secure connection.");
  return body;
}

function tokensFromResponse(body: MicrosoftTokenResponse, previous?: StoredTokens): StoredTokens {
  if (!body.access_token) throw new Error("Microsoft did not return an access token.");
  const refreshToken = body.refresh_token ?? previous?.refreshToken;
  if (!refreshToken) throw new Error("Microsoft did not return a renewable connection token.");
  return {
    accessToken: body.access_token,
    refreshToken,
    expiresAt: Date.now() + Math.max(60, body.expires_in ?? 3600) * 1000,
  };
}

async function graphRequest<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`Microsoft Graph request failed (${response.status}).`);
  return response.json() as Promise<T>;
}

async function getAccessToken(userId: number) {
  const connection = await getMicrosoftConnection(userId);
  if (!connection) throw new Error("Connect Outlook before using calendar or email features.");
  const stored = decryptMicrosoftTokens(connection.tokenCiphertext);
  if (stored.expiresAt > Date.now() + 120_000) return stored.accessToken;

  const refreshed = tokensFromResponse(await tokenRequest({
    client_id: ENV.microsoftClientId,
    client_secret: ENV.microsoftClientSecret,
    grant_type: "refresh_token",
    refresh_token: stored.refreshToken,
    scope: MICROSOFT_SCOPES.join(" "),
  }), stored);
  await upsertMicrosoftConnection({
    userId,
    tenantId: connection.tenantId,
    accountId: connection.accountId,
    accountEmail: connection.accountEmail,
    displayName: connection.displayName,
    tokenCiphertext: encryptMicrosoftTokens(refreshed),
    tokenExpiresAt: new Date(refreshed.expiresAt),
  });
  return refreshed.accessToken;
}

export async function completeMicrosoftAuthorization(userId: number, code: string) {
  const tokens = tokensFromResponse(await tokenRequest({
    client_id: ENV.microsoftClientId,
    client_secret: ENV.microsoftClientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: MICROSOFT_REDIRECT_URI,
    scope: MICROSOFT_SCOPES.join(" "),
  }));
  const profile = await graphRequest<MicrosoftProfile>(tokens.accessToken, "/me?$select=id,displayName,mail,userPrincipalName");
  if (!profile.id) throw new Error("Microsoft did not identify the signed-in account.");
  await upsertMicrosoftConnection({
    userId,
    tenantId: ENV.microsoftTenantId,
    accountId: profile.id,
    accountEmail: profile.mail ?? profile.userPrincipalName ?? null,
    displayName: profile.displayName ?? null,
    tokenCiphertext: encryptMicrosoftTokens(tokens),
    tokenExpiresAt: new Date(tokens.expiresAt),
  });
}

export async function getMicrosoftConnectionStatus(userId: number) {
  const connection = await getMicrosoftConnection(userId);
  return connection
    ? { connected: true, email: connection.accountEmail ?? null, displayName: connection.displayName ?? null, expiresAt: connection.tokenExpiresAt ?? null }
    : { connected: false, email: null, displayName: null, expiresAt: null };
}

export async function listMicrosoftCalendarEvents(userId: number, startAt: Date, endAt: Date) {
  const accessToken = await getAccessToken(userId);
  const query = new URLSearchParams({
    startDateTime: startAt.toISOString(),
    endDateTime: endAt.toISOString(),
    "$select": "id,subject,start,end,isAllDay,showAs,sensitivity,webLink",
    "$orderby": "start/dateTime",
  });
  const data = await graphRequest<{ value?: Array<Record<string, unknown>> }>(accessToken, `/me/calendarView?${query.toString()}`);
  return (data.value ?? []).map((event) => ({
    id: String(event.id),
    subject: String(event.subject ?? "Untitled event"),
    start: event.start,
    end: event.end,
    isAllDay: Boolean(event.isAllDay),
    showAs: String(event.showAs ?? "busy"),
    sensitivity: String(event.sensitivity ?? "normal"),
    webLink: typeof event.webLink === "string" ? event.webLink : null,
  }));
}

function addUtcDay(date: string) {
  const atMidnight = new Date(`${date}T00:00:00.000Z`);
  atMidnight.setUTCDate(atMidnight.getUTCDate() + 1);
  return atMidnight.toISOString().slice(0, 10);
}

export function buildPrivateAvailableTaskEvent(task: { id: number; text: string; dueAt: number }) {
  const date = new Date(task.dueAt).toISOString().slice(0, 10);
  return {
    subject: task.text,
    body: { contentType: "text", content: `Created from Stephen’s To-Do task #${task.id}.` },
    isAllDay: true,
    showAs: "free",
    sensitivity: "private",
    start: { dateTime: `${date}T00:00:00`, timeZone: "UTC" },
    end: { dateTime: `${addUtcDay(date)}T00:00:00`, timeZone: "UTC" },
  };
}

type GraphEvent = { id?: string; webLink?: string };

export async function syncTaskToMicrosoftEvent(userId: number, taskId: number) {
  const task = await getTaskById(taskId);
  if (!task?.dueAt) throw new Error("Set a due date before sending this task to Outlook Calendar.");
  const accessToken = await getAccessToken(userId);
  const body = buildPrivateAvailableTaskEvent({ id: task.id, text: task.text, dueAt: task.dueAt });
  const existing = await getMicrosoftTaskEvent(userId, taskId);
  let event: GraphEvent;

  try {
    event = existing
      ? await graphRequest<GraphEvent>(accessToken, `/me/events/${encodeURIComponent(existing.eventId)}`, { method: "PATCH", body: JSON.stringify(body) })
      : await graphRequest<GraphEvent>(accessToken, "/me/events", { method: "POST", body: JSON.stringify(body) });
  } catch (error) {
    if (!existing || !String(error).includes("404")) throw error;
    event = await graphRequest<GraphEvent>(accessToken, "/me/events", { method: "POST", body: JSON.stringify(body) });
  }

  if (!event.id) throw new Error("Microsoft did not return the calendar event.");
  await upsertMicrosoftTaskEvent({ userId, taskId, eventId: event.id, webLink: event.webLink ?? null });
  return { eventId: event.id, webLink: event.webLink ?? null };
}

type GraphMessage = {
  id?: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  webLink?: string;
  isRead?: boolean;
};

export async function listMicrosoftMessages(userId: number, limit: number) {
  const accessToken = await getAccessToken(userId);
  const query = new URLSearchParams({
    "$top": String(limit),
    "$select": "id,subject,from,receivedDateTime,webLink,isRead",
    "$orderby": "receivedDateTime DESC",
  });
  const data = await graphRequest<{ value?: GraphMessage[] }>(accessToken, `/me/messages?${query.toString()}`);
  return (data.value ?? []).flatMap((message) => message.id ? [{
    id: message.id,
    subject: message.subject?.trim() || "Untitled Outlook email",
    senderName: message.from?.emailAddress?.name ?? "Unknown sender",
    senderAddress: message.from?.emailAddress?.address ?? null,
    receivedAt: message.receivedDateTime ?? null,
    webLink: message.webLink ?? null,
    isRead: Boolean(message.isRead),
  }] : []);
}

export async function importMicrosoftMessageAsTask(userId: number, messageId: string, categoryId: number) {
  const existing = await getMicrosoftEmailImport(userId, messageId);
  if (existing) return { taskId: existing.taskId, alreadyImported: true };
  const accessToken = await getAccessToken(userId);
  const message = await graphRequest<GraphMessage>(accessToken, `/me/messages/${encodeURIComponent(messageId)}?$select=id,subject,from,receivedDateTime,webLink`);
  if (!message.id) throw new Error("Microsoft email was not found.");
  const siblings = await getTasksByCategory(categoryId);
  const sender = message.from?.emailAddress?.name ?? message.from?.emailAddress?.address ?? "Unknown sender";
  const note = [
    `Selected Outlook email from ${sender}.`,
    message.receivedDateTime ? `Received: ${new Date(message.receivedDateTime).toLocaleString("en-GB")}.` : null,
    message.webLink ? `Open in Outlook: ${message.webLink}` : null,
  ].filter(Boolean).join("\n");
  const taskId = await createTask({
    categoryId,
    text: message.subject?.trim() || "Untitled Outlook email",
    sortOrder: siblings.length,
  });

  // Add the source link without copying the email body into the task.
  await updateTask(taskId, { note });
  await createMicrosoftEmailImport({ userId, messageId, taskId });
  return { taskId, alreadyImported: false };
}
