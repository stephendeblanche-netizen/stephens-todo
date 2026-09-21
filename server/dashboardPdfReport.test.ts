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

function buildPaginationSnapshot() {
  const categoryCount = 14;
  return {
    categories: Array.from({ length: categoryCount }, (_, index) => ({
      id: index + 1,
      name: index === 0 ? "URGENT" : `Section ${index + 1}`,
      kind: index === 0 ? "urgent" as const : "normal" as const,
      colorIndex: index % 8,
      sortOrder: index,
      collapsed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    tasks: Array.from({ length: 120 }, (_, index) => ({
      id: index + 1,
      categoryId: (index % categoryCount) + 1,
      parentId: index % 7 === 1 ? index : null,
      text: `Task ${index + 1}: detailed delivery commitment for the current workstream`,
      note: index % 3 === 0 ? "This relevant task note adds detail about the deliverable, ownership discussion, risk and next action required before the agreed date." : "",
      dueAt: new Date(2026, 8, 21 + (index % 21), 12).getTime(),
      priority: index % 5 === 0 ? "high" as const : index % 3 === 0 ? "low" as const : "medium" as const,
      recurrence: index % 9 === 0 ? "weekly" as const : "none" as const,
      accountableDirectReportId: index % 2 === 0 ? 1 : null,
      responsibleColleagueIds: index % 2 === 0 ? [1, 2] : [],
      done: index % 4 === 0,
      collapsed: false,
      sortOrder: Math.floor(index / categoryCount),
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    filters: [],
    directReports: [
      { id: 1, name: "Alex Morgan", sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, name: "Jordan Lee", sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
    ],
    exportedAt,
  };
}

function pdfPageCount(pdf: Buffer) {
  return (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
}

describe("dashboard PDF report", () => {
  it("builds a complete section-based model with hierarchy, ownership and relevant notes", () => {
    const model = buildDashboardReportModel(buildSnapshot());

    expect(model.scope).toBe("all");
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

  it("builds a focused report containing only open high-priority tasks and their sections", () => {
    const model = buildDashboardReportModel(buildSnapshot(), "high_priority");

    expect(model.scope).toBe("high_priority");
    expect(model.summary).toEqual({ total: 1, open: 1, completed: 0, highPriorityOpen: 1, categories: 1 });
    expect(model.sections.map((section) => section.category.name)).toEqual(["URGENT"]);
    expect(model.sections[0]?.tasks.map((row) => row.task.text)).toEqual(["Prepare the board pack"]);
    expect(model.sections[0]?.tasks[0]?.responsibleColleagues).toEqual(["Alex Morgan", "Jordan Lee"]);
  });

  it("renders a professional PDF attachment", async () => {
    const pdf = await createDashboardPdfReport(buildSnapshot());

    expect(pdf.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it("does not append a blank page for each populated page in a dashboard-scale report", async () => {
    const pdf = await createDashboardPdfReport(buildPaginationSnapshot());

    // This fixture produces thirteen populated pages. The prior footer placement
    // caused PDFKit to append a duplicate set of thirteen blank pages.
    expect(pdfPageCount(pdf)).toBe(13);
  });
});
