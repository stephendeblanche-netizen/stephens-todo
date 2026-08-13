import { describe, expect, it } from "vitest";
import { nextRecurringDueAt } from "./taskSchedule";

describe("nextRecurringDueAt", () => {
  it("advances daily and weekly occurrences past completion", () => {
    const completedAt = Date.UTC(2026, 7, 13, 9);
    expect(nextRecurringDueAt(Date.UTC(2026, 7, 13, 12), "daily", completedAt)).toBe(Date.UTC(2026, 7, 14, 12));
    expect(nextRecurringDueAt(Date.UTC(2026, 7, 6, 12), "weekly", completedAt)).toBe(Date.UTC(2026, 7, 13, 12));
  });

  it("keeps monthly tasks on the last valid day of a shorter month", () => {
    const completedAt = Date.UTC(2026, 0, 31, 9);
    expect(nextRecurringDueAt(Date.UTC(2026, 0, 31, 12), "monthly", completedAt)).toBe(Date.UTC(2026, 1, 28, 12));
  });

  it("leaves a non-recurring due date unchanged", () => {
    expect(nextRecurringDueAt(Date.UTC(2026, 7, 13, 12), "none", Date.UTC(2026, 7, 13, 9))).toBe(Date.UTC(2026, 7, 13, 12));
  });
});
