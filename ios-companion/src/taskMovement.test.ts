import { describe, expect, it } from "vitest";
import { buildTaskMoveUpdates, buildTaskReorderUpdates, getDescendantTaskIds, isValidMoveParent } from "./taskMovement";
import type { Task } from "./types";

const task = (id: number, categoryId: number, parentId: number | null, sortOrder: number): Task => ({ id, categoryId, parentId, sortOrder, text: `Task ${id}`, note: "", done: false, dueAt: null, priority: "medium", recurrence: "none", accountableDirectReportId: null });

describe("native task movement", () => {
  const tasks = [task(1, 10, null, 0), task(2, 10, null, 1), task(3, 10, 1, 0), task(4, 20, null, 0)];

  it("identifies descendants and prevents cycle-forming parent choices", () => {
    expect([...getDescendantTaskIds(tasks, 1)]).toEqual([3]);
    expect(isValidMoveParent(tasks, 1, 3)).toBe(false);
    expect(isValidMoveParent(tasks, 1, 4)).toBe(true);
  });

  it("reindexes source and target siblings when moving across categories", () => {
    expect(buildTaskMoveUpdates(tasks, 2, { categoryId: 20, parentId: null })).toEqual([
      { id: 1, categoryId: 10, parentId: null, sortOrder: 0 },
      { id: 4, categoryId: 20, parentId: null, sortOrder: 0 },
      { id: 2, categoryId: 20, parentId: null, sortOrder: 1 },
    ]);
  });

  it("moves a task under a valid parent and can produce top-level drag-order updates", () => {
    expect(buildTaskMoveUpdates(tasks, 2, { categoryId: 10, parentId: 1 })).toEqual([
      { id: 1, categoryId: 10, parentId: null, sortOrder: 0 },
      { id: 3, categoryId: 10, parentId: 1, sortOrder: 0 },
      { id: 2, categoryId: 10, parentId: 1, sortOrder: 1 },
    ]);
    expect(buildTaskReorderUpdates([tasks[1]!, tasks[0]!, tasks[2]!], 10)).toEqual([
      { id: 1, categoryId: 10, parentId: null, sortOrder: 0 },
      { id: 2, categoryId: 10, parentId: null, sortOrder: 1 },
    ]);
  });
});
