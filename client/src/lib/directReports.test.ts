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

  it("matches either member of a multi-person Responsible Colleague assignment", () => {
    const sharedTask = { id: 4, accountableDirectReportId: 1, responsibleColleagueIds: [1, 2] };
    expect(matchesDirectReport(sharedTask.responsibleColleagueIds, 1)).toBe(true);
    expect(matchesDirectReport(sharedTask.responsibleColleagueIds, 2)).toBe(true);
    expect(matchesDirectReport(sharedTask.responsibleColleagueIds, "na")).toBe(false);
    expect(filterTasksByDirectReport([...tasks, sharedTask], 2).map((task) => task.id)).toEqual([3, 4]);
  });
});
