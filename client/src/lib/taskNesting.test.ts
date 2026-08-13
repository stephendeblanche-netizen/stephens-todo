import { describe, expect, it } from "vitest";
import { buildTaskNestUpdates, canNestTask } from "./taskNesting";

describe("task nesting validation", () => {
  const tasks = [
    { id: 1, parentId: null },
    { id: 2, parentId: 1 },
    { id: 3, parentId: 2 },
    { id: 4, parentId: null },
  ];

  it("allows moving a task under an unrelated task", () => {
    expect(canNestTask(tasks, 4, 1)).toBe(true);
  });

  it("blocks self nesting and descendant cycles", () => {
    expect(canNestTask(tasks, 1, 1)).toBe(false);
    expect(canNestTask(tasks, 1, 3)).toBe(false);
  });

  it("builds a persisted parentId, categoryId, and sortOrder payload for a nest drop", () => {
    const updates = buildTaskNestUpdates([
      { id: 1, categoryId: 10, parentId: null, sortOrder: 0 },
      { id: 2, categoryId: 10, parentId: 1, sortOrder: 0 },
      { id: 3, categoryId: 20, parentId: null, sortOrder: 0 },
    ], 3, 1);

    expect(updates).toEqual([
      { id: 2, categoryId: 10, parentId: 1, sortOrder: 0 },
      { id: 3, categoryId: 10, parentId: 1, sortOrder: 1 },
    ]);
  });

  it("does not construct an update for a cycle-producing nest drop", () => {
    const updates = buildTaskNestUpdates([
      { id: 1, categoryId: 10, parentId: null, sortOrder: 0 },
      { id: 2, categoryId: 10, parentId: 1, sortOrder: 0 },
      { id: 3, categoryId: 10, parentId: 2, sortOrder: 0 },
    ], 1, 3);

    expect(updates).toBeNull();
  });
});
