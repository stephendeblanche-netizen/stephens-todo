import { describe, expect, it } from "vitest";
import { filterTasksByDirectReport, matchesDirectReport } from "./directReports";

describe("Direct Report task filtering", () => {
  const tasks = [
    { id: 1, accountableDirectReportId: 1 },
    { id: 2, accountableDirectReportId: null },
    { id: 3, accountableDirectReportId: 2 },
  ];

  it("matches all, N/A, and a specific Direct Report", () => {
    expect(matchesDirectReport(1, "all")).toBe(true);
    expect(matchesDirectReport(null, "na")).toBe(true);
    expect(matchesDirectReport(1, "na")).toBe(false);
    expect(matchesDirectReport(2, 2)).toBe(true);
  });

  it("selects only tasks assigned to the requested Direct Report", () => {
    expect(filterTasksByDirectReport(tasks, "na").map((task) => task.id)).toEqual([2]);
    expect(filterTasksByDirectReport(tasks, 1).map((task) => task.id)).toEqual([1]);
  });
});
