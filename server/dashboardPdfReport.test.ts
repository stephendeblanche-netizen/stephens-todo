import { describe, expect, it } from "vitest";
import { buildDashboardReportModel, createDashboardPdfReport } from "./dashboardPdfReport";

const exportedAt = "2026-09-21T09:30:00.000Z";

function buildSnapshot() {
  return {
    categories: [
      { id: 1, name: "URGENT", kind: "urgent" as const, colorIndex: 0, sortOrder: 0, collapsed: false, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, name: "Operations", kind: "normal" as const, colorIndex: 1, sortOrder: 1, collapsed: false, createdAt: new Date(), updatedAt: new Date() },
    ],
    tasks: [
      {
        id: 1, categoryId: 1, parentId: null, text: "Prepare the board pack", note: "Include the latest operating results.",
        dueAt: new Date("2026-09-25T12:00:00.000Z").getTime(), priority: "high" as const, recurrence: "weekly" as const,
        accountableDirectReportId: 1, responsibleColleagueIds: [1, 2], done: false, collapsed: false, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(),
      },
      {
        id: 2, categoryId: 1, parentId: 1, text: "Confirm final inputs", note: "", dueAt: null, priority: "medium" as const, recurrence: "none" as const,
        accountableDirectReportId: 2, responsibleColleagueIds: [2], done: true, collapsed: false, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(),
      },
      {
        id: 3, categoryId: 2, parentId: null, text: "Review supplier renewal", note: "Prepare an options summary before the meeting.",
        dueAt: null, priority: "low" as const, recurrence: "none" as const,
        accountableDirectReportId: null, responsibleColleagueIds: [], done: false, collapsed: false, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(),
      },
    ],
    filters: [],
    directReports: [
      { id: 1, name: "Alex Morgan", sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, name: "Jordan Lee", sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
    ],
    exportedAt,
  };
}

describe("dashboard PDF report", () => {
  it("builds a complete section-based model with hierarchy, ownership and relevant notes", () => {
    const model = buildDashboardReportModel(buildSnapshot());

    expect(model.summary).toEqual({ total: 3, open: 2, completed: 1, highPriorityOpen: 1, categories: 2 });
    expect(model.sections).toHaveLength(2);
    expect(model.sections[0]).toMatchObject({ total: 2, open: 1, completed: 1, highPriorityOpen: 1 });
    expect(model.sections[0]?.tasks.map((row) => ({
      text: row.task.text,
      depth: row.depth,
      dueDate: row.dueDate,
      recurrenceLabel: row.recurrenceLabel,
      responsibleColleagues: row.responsibleColleagues,
      note: row.task.note,
    }))).toEqual([
      {
        text: "Prepare the board pack",
        depth: 0,
        dueDate: "25 Sept 2026",
        recurrenceLabel: "Repeats weekly",
        responsibleColleagues: ["Alex Morgan", "Jordan Lee"],
        note: "Include the latest operating results.",
      },
      {
        text: "Confirm final inputs",
        depth: 1,
        dueDate: null,
        recurrenceLabel: null,
        responsibleColleagues: ["Jordan Lee"],
        note: "",
      },
    ]);
    expect(model.sections[1]?.tasks[0]?.task.note).toBe("Prepare an options summary before the meeting.");
  });

  it("renders a professional PDF attachment", async () => {
    const pdf = await createDashboardPdfReport(buildSnapshot());

    expect(pdf.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(2000);
  });
});
