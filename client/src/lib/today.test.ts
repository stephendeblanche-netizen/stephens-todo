import { describe, expect, it } from "vitest";
import {
  dueAtFromLocalDateInput,
  isDueToday,
  selectTodayTasks,
  toLocalDateInputValue,
} from "./today";

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
});
