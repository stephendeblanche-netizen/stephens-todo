import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getSchedule: vi.fn(),
  markSent: vi.fn(),
  buildExport: vi.fn(),
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest } }));
vi.mock("./db", () => ({
  getDashboardEmailScheduleByTaskUid: mocks.getSchedule,
  markDashboardEmailScheduleSent: mocks.markSent,
}));
vi.mock("./dashboardExport", () => ({ buildDashboardExport: mocks.buildExport }));
vi.mock("nodemailer", () => ({ default: { createTransport: mocks.createTransport } }));

import { registerDailyDashboardEmailRoute } from "./dailyDashboardEmail";

describe("daily dashboard email scheduled route", () => {
  let server: ReturnType<express.Express["listen"]> | undefined;

  beforeEach(() => {
    mocks.authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "cron-test" });
    mocks.getSchedule.mockResolvedValue({ id: 9, recipient: "stephend@nutun.com", enabled: true });
    mocks.buildExport.mockResolvedValue({ categories: [], tasks: [], filters: [], directReports: [], exportedAt: "2026-08-14T17:00:00.000Z" });
    mocks.sendMail.mockResolvedValue({ messageId: "scheduled-message-id" });
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
  });

  afterEach(async () => {
    if (server) await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
    server = undefined;
    vi.clearAllMocks();
  });

  it("accepts an authenticated cron call, sends the export, and records the delivery timestamp", async () => {
    const app = express();
    registerDailyDashboardEmailRoute(app);
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once("listening", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a numeric test server port.");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/scheduled/daily-dashboard-export`, { method: "POST" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, delivery: { messageId: "scheduled-message-id" } });
    expect(mocks.markSent).toHaveBeenCalledWith(9);
  });
});
