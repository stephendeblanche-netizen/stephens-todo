import { describe, expect, it } from "vitest";
import { buildOutlookEmailPayload, buildPrivateAvailableTaskEvent } from "./microsoftIntegration";

describe("Microsoft Outlook task events", () => {
  it("creates a private, available all-day event covering the task due date", () => {
    const event = buildPrivateAvailableTaskEvent({
      id: 72,
      text: "Prepare board pack",
      dueAt: new Date("2026-09-18T12:00:00.000Z").getTime(),
    });

    expect(event).toMatchObject({
      subject: "Prepare board pack",
      isAllDay: true,
      showAs: "free",
      sensitivity: "private",
      start: { dateTime: "2026-09-18T00:00:00", timeZone: "UTC" },
      end: { dateTime: "2026-09-19T00:00:00", timeZone: "UTC" },
    });
    expect(event.body.content).toContain("Stephen’s To-Do task #72");
  });

  it("builds a plain-text email payload that saves an explicitly sent message in Sent Items", () => {
    expect(buildOutlookEmailPayload({
      to: ["colleague@example.com"],
      cc: ["manager@example.com"],
      subject: "Project update",
      body: "The task is complete.",
    })).toEqual({
      message: {
        subject: "Project update",
        body: { contentType: "Text", content: "The task is complete." },
        toRecipients: [{ emailAddress: { address: "colleague@example.com" } }],
        ccRecipients: [{ emailAddress: { address: "manager@example.com" } }],
      },
      saveToSentItems: true,
    });
  });
});
