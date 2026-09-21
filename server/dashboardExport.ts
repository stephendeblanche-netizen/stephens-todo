import { getAllCategories, getAllDirectReports, getAllSavedFilters, getAllTaskAttachments, getAllTasks } from "./db";

/** Builds the same portable snapshot returned by the dashboard's Export action. */
export async function buildDashboardExport() {
  const [categories, tasks, filters, directReports, attachments] = await Promise.all([
    getAllCategories(),
    getAllTasks(),
    getAllSavedFilters(),
    getAllDirectReports(),
    getAllTaskAttachments(),
  ]);
  return { categories, tasks, filters, directReports, attachments, exportedAt: new Date().toISOString() };
}
