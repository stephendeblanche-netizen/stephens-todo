import { getAllCategories, getAllDirectReports, getAllSavedFilters, getAllTasks } from "./db";

/** Builds the same portable snapshot returned by the dashboard's Export action. */
export async function buildDashboardExport() {
  const [categories, tasks, filters, directReports] = await Promise.all([
    getAllCategories(),
    getAllTasks(),
    getAllSavedFilters(),
    getAllDirectReports(),
  ]);
  return { categories, tasks, filters, directReports, exportedAt: new Date().toISOString() };
}
