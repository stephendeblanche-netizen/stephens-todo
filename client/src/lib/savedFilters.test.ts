import { describe, expect, it } from "vitest";
import { applySavedFilter, matchesDueRange } from "./savedFilters";

const reference = new Date("2026-08-13T09:00:00");
const atNoon = (date: string) => new Date(`${date}T12:00:00`).getTime();

describe("saved filter criteria", () => {
  it("matches calendar-based due ranges", () => {
    expect(matchesDueRange(atNoon("2026-08-13"), "today", reference)).toBe(true);
    expect(matchesDueRange(atNoon("2026-08-10"), "this_week", reference)).toBe(true);
    expect(matchesDueRange(atNoon("2026-08-16"), "this_week", reference)).toBe(true);
    expect(matchesDueRange(atNoon("2026-08-17"), "this_week", reference)).toBe(false);
    expect(matchesDueRange(atNoon("2026-08-12"), "overdue", reference)).toBe(true);
  });

  it("selects high-priority unfinished tasks due this week", () => {
    const selected = applySavedFilter([
      { id: 1, categoryId: 1, dueAt: atNoon("2026-08-14"), priority: "high" as const, done: false },
      { id: 2, categoryId: 1, dueAt: atNoon("2026-08-14"), priority: "medium" as const, done: false },
      { id: 3, categoryId: 1, dueAt: atNoon("2026-08-17"), priority: "high" as const, done: false },
      { id: 4, categoryId: 1, dueAt: atNoon("2026-08-14"), priority: "high" as const, done: true },
    ], {
      priority: "high",
      dueRange: "this_week",
      categoryId: null,
      includeCompleted: false,
    }, reference);

    expect(selected.map((task) => task.id)).toEqual([1]);
  });
});
