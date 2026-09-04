import { describe, expect, it } from "vitest";
import { buildPrivateAvailableTaskEvent } from "./microsoftIntegration";

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
});
