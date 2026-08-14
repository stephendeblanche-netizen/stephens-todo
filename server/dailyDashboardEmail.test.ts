import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildDashboardExport: vi.fn(),
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("./dashboardExport", () => ({ buildDashboardExport: mocks.buildDashboardExport }));
vi.mock("nodemailer", () => ({ default: { createTransport: mocks.createTransport } }));

import { sendDailyDashboardExport } from "./dailyDashboardEmail";

describe("daily dashboard email", () => {
  beforeEach(() => {
    mocks.buildDashboardExport.mockResolvedValue({ categories: [{ id: 1, name: "URGENT" }], tasks: [], filters: [], directReports: [], exportedAt: "2026-08-14T17:00:00.000Z" });
    mocks.sendMail.mockResolvedValue({ messageId: "smtp-message-id" });
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
  });

  it("sends a dated JSON snapshot attachment to the configured recipient", async () => {
    const result = await sendDailyDashboardExport("stephend@nutun.com", new Date("2026-08-14T17:00:00.000Z"));

    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp.gmail.com", port: 465, secure: true }));
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: "stephend@nutun.com",
      subject: "Stephen's To-Do Dashboard export — 2026-08-14",
      attachments: [expect.objectContaining({ filename: "stephens-todo-dashboard-2026-08-14.json", contentType: "application/json" })],
    }));
    expect(result).toEqual({ messageId: "smtp-message-id", exportDate: "2026-08-14" });
  });
});
