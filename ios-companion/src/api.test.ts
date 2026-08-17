import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
import { addTask, createCategoryRemote, createDirectReportRemote, getDashboard, patchTask } from "./api";

const response = (json: unknown) => ({ ok: true, json: async () => json }) as Response;
const envelope = (json: unknown) => ({ result: { data: { json } } });

describe("iOS companion dashboard workflows", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads categories, tasks, and Direct Reports from the shared dashboard API", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(envelope([{ id: 1, name: "URGENT", kind: "urgent", colorIndex: 0, sortOrder: 0 }])))
      .mockResolvedValueOnce(response(envelope([{ id: 5, categoryId: 1, parentId: null, text: "Call client", note: "", done: false, sortOrder: 0, dueAt: null, priority: "high", recurrence: "none", accountableDirectReportId: null }])))
      .mockResolvedValueOnce(response(envelope([{ id: 3, name: "Alex", sortOrder: 0 }])));
    vi.stubGlobal("fetch", fetchMock);

    const dashboard = await getDashboard();

    expect(dashboard.categories[0]?.name).toBe("URGENT");
    expect(dashboard.tasks[0]?.text).toBe("Call client");
    expect(dashboard.directReports[0]?.name).toBe("Alex");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("sends a task priority update through the dashboard mutation contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(envelope({ success: true })));
    vi.stubGlobal("fetch", fetchMock);

    await patchTask(5, { priority: "low" });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/trpc/tasks.update"), expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ json: { id: 5, priority: "low" } }),
    }));
  });

  it("appends a new task after calculating the next top-level sort order", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(envelope([{ id: 1, categoryId: 2, parentId: null }, { id: 2, categoryId: 2, parentId: null }, { id: 3, categoryId: 2, parentId: 1 }])))
      .mockResolvedValueOnce(response(envelope({ id: 4 })));
    vi.stubGlobal("fetch", fetchMock);

    await addTask(2, "Prepare report");

    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ json: { categoryId: 2, text: "Prepare report", sortOrder: 2, priority: "medium" } }),
    }));
  });

  it("creates categories and Direct Reports through the shared dashboard mutation contracts", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(envelope({ id: 8 })))
      .mockResolvedValueOnce(response(envelope({ id: 9 })));
    vi.stubGlobal("fetch", fetchMock);

    await createCategoryRemote({ name: "Planning", sortOrder: 3 });
    await createDirectReportRemote({ name: "Jordan", sortOrder: 2 });

    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/trpc/categories.create");
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ body: JSON.stringify({ json: { name: "Planning", sortOrder: 3, kind: "normal", colorIndex: 3 } }) }));
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/api/trpc/directReports.create");
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ body: JSON.stringify({ json: { name: "Jordan", sortOrder: 2 } }) }));
  });
});
