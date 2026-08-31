import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
const api = vi.hoisted(() => ({ getDashboard: vi.fn(), patchTask: vi.fn(), createTaskRemote: vi.fn() }));
vi.mock("./api", () => api);
import { addTemporaryTask, applyTaskPatch, enqueueMutation, flushQueuedMutations, loadMutationQueue } from "./offlineSync";
import type { DashboardPayload } from "./types";

const dashboard: DashboardPayload = {
  categories: [{ id: 1, name: "Tasks", kind: "normal", colorIndex: 0, sortOrder: 0 }],
  directReports: [],
  tasks: [{ id: 4, categoryId: 1, parentId: null, text: "Existing", note: "", done: false, sortOrder: 0, dueAt: null, priority: "medium", recurrence: "none", accountableDirectReportId: null }],
  syncedAt: 1,
};

describe("offline dashboard mutations", () => {
  it("updates a cached task without mutating the prior snapshot", () => {
    const next = applyTaskPatch(dashboard, 4, { done: true });
    expect(next.tasks[0].done).toBe(true);
    expect(dashboard.tasks[0].done).toBe(false);
  });

  it("adds a negative temporary task with configured details until a queued create is synchronized", () => {
    const next = addTemporaryTask(dashboard, { categoryId: 1, text: "Offline task", sortOrder: 1, dueAt: 1789477200000, priority: "high", recurrence: "weekly", accountableDirectReportId: 7 });
    expect(next.tasks).toHaveLength(2);
    expect(next.tasks[1].id).toBeLessThan(0);
    expect(next.tasks[1]).toMatchObject({ dueAt: 1789477200000, priority: "high", recurrence: "weekly", accountableDirectReportId: 7 });
  });

  it("replays queued edits and refreshes the dashboard after reconnecting", async () => {
    api.patchTask.mockResolvedValue({ success: true });
    api.getDashboard.mockResolvedValue({ ...dashboard, syncedAt: 2, tasks: [{ ...dashboard.tasks[0], done: true }] });
    await enqueueMutation({ type: "patch", taskId: 4, patch: { done: true } });
    const refreshed = await flushQueuedMutations();
    expect(api.patchTask).toHaveBeenCalledWith(4, { done: true });
    expect(api.getDashboard).toHaveBeenCalledOnce();
    expect(refreshed?.tasks[0].done).toBe(true);
  });

  it("preserves a server-side change to an unpatched field while replaying an offline edit", async () => {
    api.patchTask.mockResolvedValue({ success: true });
    api.getDashboard.mockResolvedValue({
      ...dashboard,
      syncedAt: 3,
      tasks: [{ ...dashboard.tasks[0], text: "Renamed on another device", done: true }],
    });
    await enqueueMutation({ type: "patch", taskId: 4, patch: { done: true } });
    const refreshed = await flushQueuedMutations();
    expect(api.patchTask).toHaveBeenCalledWith(4, { done: true });
    expect(refreshed?.tasks[0]).toMatchObject({ text: "Renamed on another device", done: true });
  });

  it("remaps edits for an offline-created task to its server ID before replaying them", async () => {
    api.createTaskRemote.mockResolvedValue({ id: 44 });
    api.patchTask.mockResolvedValue({ success: true });
    api.getDashboard.mockResolvedValue({ ...dashboard, tasks: [{ ...dashboard.tasks[0] }, { ...dashboard.tasks[0], id: 44, text: "Created offline", done: true }] });
    await enqueueMutation({ type: "create", temporaryTaskId: -9, input: { categoryId: 1, text: "Created offline", sortOrder: 1, priority: "medium", mobileClientMutationId: "offline-create-9" } });
    await enqueueMutation({ type: "patch", taskId: -9, patch: { done: true } });
    await flushQueuedMutations();
    expect(api.createTaskRemote).toHaveBeenCalledWith(expect.objectContaining({ mobileClientMutationId: "offline-create-9" }));
    expect(api.patchTask).toHaveBeenCalledWith(44, { done: true });
    expect(await loadMutationQueue()).toEqual([]);
  });
});
