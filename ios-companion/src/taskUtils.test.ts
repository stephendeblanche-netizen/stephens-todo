import { describe, expect, it } from "vitest";
import { dueText, orderTasks, priorityColor, taskMatchesPriority } from "./taskUtils";

describe("iOS companion task helpers", () => {
  it("filters priority and formats lightweight task metadata", () => {
    const task = { priority: "high" } as any;
    expect(taskMatchesPriority(task, "high")).toBe(true);
    expect(taskMatchesPriority(task, "low")).toBe(false);
    expect(dueText(null)).toBe("No due date");
    expect(priorityColor("low")).toBe("#248A50");
  });

  it("renders each category as a depth-first parent and sub-category tree", () => {
    const categories = [{ id: 2, sortOrder: 1 }, { id: 1, sortOrder: 0 }] as any;
    const tasks = [
      { id: 11, categoryId: 1, parentId: 10, sortOrder: 1, text: "Second child" },
      { id: 12, categoryId: 1, parentId: 13, sortOrder: 0, text: "Grandchild" },
      { id: 20, categoryId: 2, parentId: null, sortOrder: 0, text: "Other category root" },
      { id: 13, categoryId: 1, parentId: 10, sortOrder: 0, text: "First child" },
      { id: 10, categoryId: 1, parentId: null, sortOrder: 1, text: "Parent" },
      { id: 9, categoryId: 1, parentId: null, sortOrder: 0, text: "First root" },
    ] as any;

    expect(orderTasks(tasks, categories).map(({ id, hierarchyDepth, parentTaskText }) => ({ id, hierarchyDepth, parentTaskText }))).toEqual([
      { id: 9, hierarchyDepth: 0, parentTaskText: null },
      { id: 10, hierarchyDepth: 0, parentTaskText: null },
      { id: 13, hierarchyDepth: 1, parentTaskText: "Parent" },
      { id: 12, hierarchyDepth: 2, parentTaskText: "First child" },
      { id: 11, hierarchyDepth: 1, parentTaskText: "Parent" },
      { id: 20, hierarchyDepth: 0, parentTaskText: null },
    ]);
  });
});
