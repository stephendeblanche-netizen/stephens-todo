import { describe, expect, it } from "vitest";
import { createDashboardPdfReport } from "./dashboardPdfReport";

describe("dashboard PDF report", () => {
  it("renders a readable PDF containing the task report", async () => {
    const pdf = await createDashboardPdfReport({
      categories: [{ id: 1, name: "URGENT", kind: "urgent", colorIndex: 0, sortOrder: 0, collapsed: false, createdAt: new Date(), updatedAt: new Date() }],
      tasks: [{ id: 1, categoryId: 1, parentId: null, text: "Prepare the board pack", note: "Include the latest operating results.", dueAt: null, priority: "high", recurrence: "none", accountableDirectReportId: null, done: false, collapsed: false, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() }],
      filters: [],
      directReports: [],
      exportedAt: "2026-08-14T17:00:00.000Z",
    });

    expect(pdf.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(500);
  });
});
