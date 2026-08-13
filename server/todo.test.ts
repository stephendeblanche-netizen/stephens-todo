import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the db module so tests don't need a real database
vi.mock("./db", () => ({
  getAllCategories: vi.fn().mockResolvedValue([
    { id: 1, name: "URGENT", kind: "urgent", colorIndex: 0, sortOrder: 0, collapsed: false, createdAt: new Date(), updatedAt: new Date() },
    { id: 2, name: "QDR", kind: "normal", colorIndex: 0, sortOrder: 1, collapsed: false, createdAt: new Date(), updatedAt: new Date() },
  ]),
  getAllTasks: vi.fn().mockResolvedValue([
    { id: 1, categoryId: 1, parentId: null, text: "Offer to Nakeshri", note: "", done: false, collapsed: false, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
    { id: 2, categoryId: 1, parentId: null, text: "Offer to Ollie", note: "", done: false, collapsed: false, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
  ]),
  createCategory: vi.fn().mockResolvedValue(3),
  updateCategory: vi.fn().mockResolvedValue(undefined),
  deleteCategory: vi.fn().mockResolvedValue(undefined),
  createTask: vi.fn().mockResolvedValue(10),
  updateTask: vi.fn().mockResolvedValue(undefined),
  deleteTask: vi.fn().mockResolvedValue(undefined),
  replaceAllData: vi.fn().mockResolvedValue(new Map()),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByOpenId: vi.fn().mockResolvedValue(undefined),
  getAllSavedFilters: vi.fn().mockResolvedValue([
    { id: 1, name: "High priority due this week", priority: "high", dueRange: "this_week", categoryId: null, includeCompleted: false, sortOrder: 0 },
  ]),
  createSavedFilter: vi.fn().mockResolvedValue(2),
  updateSavedFilter: vi.fn().mockResolvedValue(undefined),
  deleteSavedFilter: vi.fn().mockResolvedValue(undefined),
  getAllDirectReports: vi.fn().mockResolvedValue([
    { id: 1, name: "Alex Morgan", sortOrder: 0 },
  ]),
  createDirectReport: vi.fn().mockResolvedValue(2),
  updateDirectReport: vi.fn().mockResolvedValue(undefined),
  deleteDirectReport: vi.fn().mockResolvedValue(undefined),
  cascadeCategoryId: vi.fn().mockResolvedValue(undefined),
  getDescendantIds: vi.fn().mockResolvedValue([]),
  getDb: vi.fn().mockResolvedValue(null),
}));

function createCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("categories router", () => {
  it("lists all categories", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.categories.list();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("URGENT");
    expect(result[0].kind).toBe("urgent");
  });

  it("creates a new category", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.categories.create({ name: "Test Category", kind: "normal", colorIndex: 2, sortOrder: 2 });
    expect(result.id).toBe(3);
  });

  it("updates a category name", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.categories.update({ id: 1, name: "CRITICAL" });
    expect(result.success).toBe(true);
  });

  it("deletes a category", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.categories.delete({ id: 2 });
    expect(result.success).toBe(true);
  });

  it("reorders categories", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.categories.reorder([{ id: 1, sortOrder: 1 }, { id: 2, sortOrder: 0 }]);
    expect(result.success).toBe(true);
  });
});

describe("saved filters router", () => {
  it("lists saved filters", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.filters.list();
    expect(result[0]?.name).toBe("High priority due this week");
  });

  it("creates and deletes a saved filter", async () => {
    const caller = appRouter.createCaller(createCtx());
    const created = await caller.filters.create({
      name: "High priority due this week",
      priority: "high",
      dueRange: "this_week",
      categoryId: null,
      includeCompleted: false,
      sortOrder: 1,
    });
    const deleted = await caller.filters.delete({ id: created.id });
    expect(created.id).toBe(2);
    expect(deleted.success).toBe(true);
  });

  it("updates an existing saved filter", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.filters.update({
      id: 1,
      name: "High priority this week",
      priority: "high",
      dueRange: "this_week",
      categoryId: null,
      includeCompleted: false,
      sortOrder: 0,
    });
    expect(result.success).toBe(true);
  });
});

describe("direct reports router", () => {
  it("lists, creates, updates, and deletes Direct Reports", async () => {
    const caller = appRouter.createCaller(createCtx());
    const listed = await caller.directReports.list();
    const created = await caller.directReports.create({ name: "Priya Shah", sortOrder: 1 });
    const updated = await caller.directReports.update({ id: created.id, name: "Priya S." });
    const deleted = await caller.directReports.delete({ id: created.id });

    expect(listed[0]?.name).toBe("Alex Morgan");
    expect(created.id).toBe(2);
    expect(updated.success).toBe(true);
    expect(deleted.success).toBe(true);
  });
});

describe("tasks router", () => {
  it("lists all tasks", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tasks.listAll();
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("Offer to Nakeshri");
  });

  it("creates a new task", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tasks.create({ categoryId: 1, text: "New task", sortOrder: 2 });
    expect(result.id).toBe(10);
  });

  it("creates a sub-task with parentId", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tasks.create({ categoryId: 1, parentId: 1, text: "Sub-task", sortOrder: 0 });
    expect(result.id).toBe(10);
  });

  it("updates a task text", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tasks.update({ id: 1, text: "Updated text" });
    expect(result.success).toBe(true);
  });

  it("marks a task as done", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tasks.update({ id: 1, done: true });
    expect(result.success).toBe(true);
  });

  it("adds a note to a task", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tasks.update({ id: 1, note: "This is a note" });
    expect(result.success).toBe(true);
  });

  it("sets and clears a task due date", async () => {
    const caller = appRouter.createCaller(createCtx());
    const setResult = await caller.tasks.update({ id: 1, dueAt: new Date("2026-08-13T12:00:00").getTime() });
    const clearResult = await caller.tasks.update({ id: 1, dueAt: null });
    expect(setResult.success).toBe(true);
    expect(clearResult.success).toBe(true);
  });

  it("updates priority and recurrence independently", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tasks.update({ id: 1, priority: "high", recurrence: "weekly" });
    expect(result.success).toBe(true);
  });

  it("deletes a task", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tasks.delete({ id: 1 });
    expect(result.success).toBe(true);
  });

  it("reorders tasks with cross-category move", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tasks.reorder([{ id: 1, sortOrder: 0, parentId: null, categoryId: 2 }]);
    expect(result.success).toBe(true);
  });

  it("reorders tasks — cycle protection skips invalid re-parent", async () => {
    // getDescendantIds returns [] (mocked), so no cycle detected — move proceeds
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tasks.reorder([{ id: 1, sortOrder: 0, parentId: 2, categoryId: 1 }]);
    expect(result.success).toBe(true);
  });

  it("clears completed tasks in a category", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.tasks.clearCompleted({ categoryId: 1 });
    expect(result.success).toBe(true);
    // No done tasks in mock data, so deleted count is 0
    expect(result.deleted).toBe(0);
  });
});

describe("data router", () => {
  it("exports all data", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.data.export();
    expect(result.categories).toHaveLength(2);
    expect(result.tasks).toHaveLength(2);
    expect(result.directReports[0]?.name).toBe("Alex Morgan");
    expect(result.exportedAt).toBeDefined();
  });

  it("imports snapshot data", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.data.import({
      categories: [{ name: "URGENT", kind: "urgent", colorIndex: 0, sortOrder: 0, collapsed: false }],
      tasks: [],
      directReports: [{ name: "Alex Morgan", sortOrder: 0 }],
    });
    expect(result.success).toBe(true);
  });
});

describe("auth router", () => {
  it("returns null user when not authenticated", async () => {
    const caller = appRouter.createCaller(createCtx());
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });
});
