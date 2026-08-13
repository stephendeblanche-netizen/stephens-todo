export type DirectReportFilter = "all" | "na" | number;

type AccountableTask = {
  accountableDirectReportId: number | null;
};

export function matchesDirectReport(
  accountableDirectReportId: number | null,
  filter: DirectReportFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "na") return accountableDirectReportId === null;
  return accountableDirectReportId === filter;
}

export function filterTasksByDirectReport<T extends AccountableTask>(
  tasks: T[],
  filter: DirectReportFilter,
): T[] {
  return filter === "all" ? tasks : tasks.filter((task) => matchesDirectReport(task.accountableDirectReportId, filter));
}
