import { describe, expect, it } from "vitest";
import { calendarMonthDays, dateKey, filterTasksByPriority, groupTasksByDay } from "./calendar";

describe("calendar helpers", () => {
  it("creates a Sunday-first six-week month grid", () => {
    const days = calendarMonthDays(new Date(2026, 7, 1));
    expect(days).toHaveLength(42);
    expect(dateKey(days[0])).toBe("2026-07-26");
    expect(dateKey(days[6])).toBe("2026-08-01");
  });

  it("groups only dated tasks by their local calendar day", () => {
    const groups = groupTasksByDay([
      { id: 1, dueAt: new Date("2026-08-13T12:00:00").getTime(), done: false, priority: "high" as const },
      { id: 2, dueAt: new Date("2026-08-13T15:00:00").getTime(), done: false, priority: "low" as const },
      { id: 3, dueAt: null, done: false, priority: "medium" as const },
    ]);
    expect(groups.get("2026-08-13")?.map((task) => task.id)).toEqual([1, 2]);
    expect(groups.size).toBe(1);
  });

  it("filters tasks by priority without changing the all-tasks selection", () => {
    const tasks = [
      { id: 1, dueAt: null, done: false, priority: "high" as const },
      { id: 2, dueAt: null, done: false, priority: "low" as const },
    ];
    expect(filterTasksByPriority(tasks, "high").map((task) => task.id)).toEqual([1]);
    expect(filterTasksByPriority(tasks, "all")).toEqual(tasks);
  });
});
