export type DirectReportFilter = "all" | "na" | number;

type AccountableTask = {
  accountableDirectReportId: number | null;
  responsibleColleagueIds?: number[];
};

export function matchesDirectReport(
  responsibleColleagueIds: number | number[] | null | undefined,
  filter: DirectReportFilter,
): boolean {
  const ids = Array.isArray(responsibleColleagueIds)
    ? responsibleColleagueIds
    : responsibleColleagueIds === null || responsibleColleagueIds === undefined ? [] : [responsibleColleagueIds];
  if (filter === "all") return true;
  if (filter === "na") return ids.length === 0;
  return ids.includes(filter);
}

export function filterTasksByDirectReport<T extends AccountableTask>(
  tasks: T[],
  filter: DirectReportFilter,
): T[] {
  return filter === "all" ? tasks : tasks.filter((task) => matchesDirectReport(task.responsibleColleagueIds ?? task.accountableDirectReportId, filter));
}
