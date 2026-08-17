import { describe, expect, it } from "vitest";
import { selectReminderTasks } from "./mobileReminders";

const tasks = [
  { id: 1, text: "Urgent task", done: false, dueAt: null, categoryId: 10 },
  { id: 2, text: "Due task", done: false, dueAt: Date.UTC(2026, 7, 17, 8), categoryId: 20 },
  { id: 3, text: "Completed urgent", done: true, dueAt: null, categoryId: 10 },
];
const categories = [{ id: 10, kind: "urgent" as const }, { id: 20, kind: "normal" as const }];

describe("selectReminderTasks", () => {
  it("selects incomplete urgent-category tasks", () => {
    expect(selectReminderTasks("urgent", tasks, categories, new Date(Date.UTC(2026, 7, 17, 8))).map((task) => task.id)).toEqual([1]);
  });

  it("selects incomplete tasks due on the current SAST date", () => {
    expect(selectReminderTasks("due", tasks, categories, new Date(Date.UTC(2026, 7, 17, 8))).map((task) => task.id)).toEqual([2]);
  });
});
