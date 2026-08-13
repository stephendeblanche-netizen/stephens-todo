import { describe, expect, it } from "vitest";
import { buildSensorTaskPlacementUpdates, buildTaskPlacementUpdates, getDragActivator, type ReorderableTask } from "./taskDrop";

const tasks: ReorderableTask[] = [
  { id: 1, categoryId: 1, parentId: null, sortOrder: 0 },
  { id: 2, categoryId: 1, parentId: null, sortOrder: 1 },
  { id: 3, categoryId: 1, parentId: 2, sortOrder: 0 },
  { id: 4, categoryId: 2, parentId: null, sortOrder: 0 },
];

describe("buildTaskPlacementUpdates", () => {
  it("places a task in an empty category as a top-level item", () => {
    const updates = buildTaskPlacementUpdates(tasks, 1, { categoryId: 3, parentId: null, index: 0 });
    expect(updates).toEqual([{ id: 1, categoryId: 3, parentId: null, sortOrder: 0 }]);
  });

  it("places a task between two siblings at the requested gap", () => {
    const updates = buildTaskPlacementUpdates(tasks, 4, { categoryId: 1, parentId: null, index: 1 });
    expect(updates?.map((task) => task.id)).toEqual([1, 4, 2]);
  });

  it("reorders a task after a sibling without an off-by-one error", () => {
    const updates = buildTaskPlacementUpdates(tasks, 1, { categoryId: 1, parentId: null, index: 2 });
    expect(updates?.map((task) => task.id)).toEqual([2, 1]);
  });

  it("moves a task into a parent’s sub-task list and blocks descendant cycles", () => {
    const nested = buildTaskPlacementUpdates(tasks, 1, { categoryId: 1, parentId: 2, index: 1 });
    expect(nested?.map((task) => task.id)).toEqual([3, 1]);
    expect(buildTaskPlacementUpdates(tasks, 2, { categoryId: 1, parentId: 3, index: 0 })).toBeNull();
  });

  it("uses the same gap placement payload after pointer and touch activator paths", () => {
    const destination = { categoryId: 1, parentId: null, index: 1 };
    expect(getDragActivator("pointerdown")).toBe("pointer");
    expect(getDragActivator("touchstart")).toBe("touch");
    const pointerDrop = buildSensorTaskPlacementUpdates("pointer", tasks, 4, destination);
    const touchDrop = buildSensorTaskPlacementUpdates("touch", tasks, 4, destination);
    expect(touchDrop).toEqual(pointerDrop);
    expect(touchDrop?.map((task) => task.id)).toEqual([1, 4, 2]);
  });
});
