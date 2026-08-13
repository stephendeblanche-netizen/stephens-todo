import { describe, expect, it } from "vitest";
import {
  dueAtFromLocalDateInput,
  isDueToday,
  isDueWithinNextDays,
  selectUpcomingTasks,
  selectTodayTasks,
  toLocalDateInputValue,
} from "./today";
import { filterTasksByPriority } from "./calendar";

const today = new Date("2026-08-13T09:00:00");

describe("Today view date helpers", () => {
  it("round-trips local date inputs at local noon", () => {
    const timestamp = dueAtFromLocalDateInput("2026-08-13");
    expect(timestamp).not.toBeNull();
    expect(toLocalDateInputValue(timestamp)).toBe("2026-08-13");
  });

  it("recognises due-today dates without matching adjacent days", () => {
    expect(isDueToday(dueAtFromLocalDateInput("2026-08-13"), today)).toBe(true);
    expect(isDueToday(dueAtFromLocalDateInput("2026-08-14"), today)).toBe(false);
  });

  it("selects unfinished urgent and due-today tasks, prioritising urgent tasks", () => {
    const selected = selectTodayTasks(
      [
        { id: 1, categoryId: 1, dueAt: null, done: false, sortOrder: 2 },
        { id: 2, categoryId: 2, dueAt: dueAtFromLocalDateInput("2026-08-13"), done: false, sortOrder: 0 },
        { id: 3, categoryId: 2, dueAt: dueAtFromLocalDateInput("2026-08-13"), done: true, sortOrder: 1 },
        { id: 4, categoryId: 2, dueAt: dueAtFromLocalDateInput("2026-08-14"), done: false, sortOrder: 2 },
      ],
      [
        { id: 1, kind: "urgent", sortOrder: 1 },
        { id: 2, kind: "normal", sortOrder: 0 },
      ],
      today,
    );

    expect(selected.map((task) => task.id)).toEqual([1, 2]);
  });

  it("selects unfinished tasks due in the next seven calendar days and sorts high priority first", () => {
    const selected = selectUpcomingTasks(
      [
        { id: 1, categoryId: 1, dueAt: dueAtFromLocalDateInput("2026-08-14"), priority: "low" as const, done: false, sortOrder: 0 },
        { id: 2, categoryId: 1, dueAt: dueAtFromLocalDateInput("2026-08-19"), priority: "high" as const, done: false, sortOrder: 1 },
        { id: 3, categoryId: 1, dueAt: dueAtFromLocalDateInput("2026-08-20"), priority: "medium" as const, done: false, sortOrder: 2 },
        { id: 4, categoryId: 1, dueAt: dueAtFromLocalDateInput("2026-08-15"), priority: "high" as const, done: true, sortOrder: 3 },
      ],
      [{ id: 1, kind: "normal", sortOrder: 0 }],
      today,
    );

    expect(isDueWithinNextDays(dueAtFromLocalDateInput("2026-08-19"), 7, today)).toBe(true);
    expect(isDueWithinNextDays(dueAtFromLocalDateInput("2026-08-20"), 7, today)).toBe(false);
    expect(selected.map((task) => task.id)).toEqual([2, 1]);
  });

  it("applies the same priority filter to Today, Upcoming, and High quick view selections", () => {
    const tasks = [
      { id: 1, categoryId: 1, dueAt: dueAtFromLocalDateInput("2026-08-13"), priority: "high" as const, done: false, sortOrder: 0 },
      { id: 2, categoryId: 2, dueAt: dueAtFromLocalDateInput("2026-08-14"), priority: "medium" as const, done: false, sortOrder: 1 },
      { id: 3, categoryId: 2, dueAt: dueAtFromLocalDateInput("2026-08-15"), priority: "high" as const, done: false, sortOrder: 2 },
    ];
    const categories = [{ id: 1, kind: "urgent" as const, sortOrder: 0 }, { id: 2, kind: "normal" as const, sortOrder: 1 }];

    expect(filterTasksByPriority(selectTodayTasks(tasks, categories, today), "high").map((task) => task.id)).toEqual([1]);
    expect(filterTasksByPriority(selectUpcomingTasks(tasks, categories, today), "high").map((task) => task.id)).toEqual([1, 3]);
    expect(filterTasksByPriority(tasks, "high").filter((task) => !task.done).map((task) => task.id)).toEqual([1, 3]);
  });
});
