import { and, asc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { DashboardEmailSchedule, InsertUser, MobileReminderSchedule, categories, dashboardEmailSchedules, directReports, microsoftConnections, microsoftEmailImports, microsoftTaskEvents, mobilePushDevices, mobileReminderSchedules, savedFilters, tasks, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { seedIfEmpty } from "./seed";
import { nextRecurringDueAt, type TaskRecurrence } from "../shared/taskSchedule";

let _db: ReturnType<typeof drizzle> | null = null;
let _seeded = false;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
      if (!_seeded) {
        _seeded = true;
        await seedIfEmpty(_db);
      }
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ---- Users ----

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);

  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot get user: database not available"); return undefined; }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ---- Categories ----

export async function getAllCategories() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(categories).orderBy(asc(categories.sortOrder));
}

export async function createCategory(data: { name: string; kind: "urgent" | "normal"; colorIndex: number; sortOrder: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const name = data.name.trim();
  const existing = await db.select({ id: categories.id }).from(categories).where(eq(categories.name, name)).limit(1);
  if (existing[0]) return existing[0].id;
  const [result] = await db.insert(categories).values({ ...data, name, collapsed: false });
  return (result as unknown as { insertId: number }).insertId;
}

export async function updateCategory(id: number, data: Partial<{ name: string; kind: "urgent" | "normal"; colorIndex: number; sortOrder: number; collapsed: boolean }>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(categories).set(data).where(eq(categories.id, id));
}

export async function deleteCategory(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Delete all tasks in this category first
  await db.delete(tasks).where(eq(tasks.categoryId, id));
  await db.delete(categories).where(eq(categories.id, id));
}

// ---- Saved filters ----

export type SavedFilterInput = {
  name: string;
  priority: "all" | "high" | "medium" | "low";
  dueRange: "all" | "today" | "this_week" | "next_7_days" | "overdue" | "no_due_date";
  categoryId: number | null;
  includeCompleted: boolean;
  sortOrder: number;
};

export async function getAllSavedFilters() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(savedFilters).orderBy(asc(savedFilters.sortOrder));
}

export async function createSavedFilter(data: SavedFilterInput) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(savedFilters).values(data);
  return (result as unknown as { insertId: number }).insertId;
}

export async function updateSavedFilter(id: number, data: SavedFilterInput) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(savedFilters).set(data).where(eq(savedFilters.id, id));
}

export async function deleteSavedFilter(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(savedFilters).where(eq(savedFilters.id, id));
}

// ---- Direct Reports ----

export async function getAllDirectReports() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(directReports).orderBy(asc(directReports.sortOrder), asc(directReports.name));
}

export async function createDirectReport(data: { name: string; sortOrder: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(directReports).values(data);
  return (result as unknown as { insertId: number }).insertId;
}

export async function updateDirectReport(id: number, data: Partial<{ name: string; sortOrder: number }>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(directReports).set(data).where(eq(directReports.id, id));
}

export async function deleteDirectReport(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(tasks).set({ accountableDirectReportId: null }).where(eq(tasks.accountableDirectReportId, id));
  await db.delete(directReports).where(eq(directReports.id, id));
}

// ---- Microsoft Outlook delegated connection ----

export async function getMicrosoftConnection(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(microsoftConnections).where(eq(microsoftConnections.userId, userId)).limit(1);
  return result[0];
}

export async function upsertMicrosoftConnection(data: {
  userId: number;
  tenantId: string;
  accountId: string;
  accountEmail?: string | null;
  displayName?: string | null;
  tokenCiphertext: string;
  tokenExpiresAt?: Date | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(microsoftConnections).values(data).onDuplicateKeyUpdate({
    set: {
      tenantId: data.tenantId,
      accountId: data.accountId,
      accountEmail: data.accountEmail ?? null,
      displayName: data.displayName ?? null,
      tokenCiphertext: data.tokenCiphertext,
      tokenExpiresAt: data.tokenExpiresAt ?? null,
      updatedAt: new Date(),
    },
  });
}

export async function deleteMicrosoftConnection(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(microsoftConnections).where(eq(microsoftConnections.userId, userId));
}

export async function getMicrosoftTaskEvent(userId: number, taskId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(microsoftTaskEvents)
    .where(and(eq(microsoftTaskEvents.userId, userId), eq(microsoftTaskEvents.taskId, taskId)))
    .limit(1);
  return result[0];
}

export async function upsertMicrosoftTaskEvent(data: { userId: number; taskId: number; eventId: string; webLink?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(microsoftTaskEvents).values(data).onDuplicateKeyUpdate({
    set: { eventId: data.eventId, webLink: data.webLink ?? null, updatedAt: new Date() },
  });
}

export async function getMicrosoftEmailImport(userId: number, messageId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(microsoftEmailImports)
    .where(and(eq(microsoftEmailImports.userId, userId), eq(microsoftEmailImports.messageId, messageId)))
    .limit(1);
  return result[0];
}

export async function createMicrosoftEmailImport(data: { userId: number; messageId: string; taskId: number }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(microsoftEmailImports).values(data);
}

// ---- Scheduled dashboard email ----

export async function getDashboardEmailScheduleByTaskUid(taskUid: string): Promise<DashboardEmailSchedule | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(dashboardEmailSchedules)
    .where(eq(dashboardEmailSchedules.scheduleCronTaskUid, taskUid)).limit(1);
  return result[0];
}

export async function getDashboardEmailSchedule(): Promise<DashboardEmailSchedule | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(dashboardEmailSchedules).orderBy(asc(dashboardEmailSchedules.id)).limit(1);
  return result[0];
}

export async function updateDashboardEmailSchedule(id: number, data: { recipient: string; deliveryTimeSast: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(dashboardEmailSchedules).set(data).where(eq(dashboardEmailSchedules.id, id));
}

export async function markDashboardEmailScheduleSent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(dashboardEmailSchedules).set({ lastSentAt: new Date() }).where(eq(dashboardEmailSchedules.id, id));
}

// ---- Mobile push reminders ----

export async function registerMobilePushDevice(data: { installationId: string; expoPushToken: string; platform: "ios"; enabled: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(mobilePushDevices).values({ ...data, lastSeenAt: new Date() }).onDuplicateKeyUpdate({
    set: { expoPushToken: data.expoPushToken, platform: data.platform, enabled: data.enabled, lastSeenAt: new Date() },
  });
}

export async function getActiveMobilePushDevices() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mobilePushDevices).where(eq(mobilePushDevices.enabled, true));
}

export async function getMobileReminderSchedule(): Promise<MobileReminderSchedule> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db.select().from(mobileReminderSchedules).orderBy(asc(mobileReminderSchedules.id)).limit(1);
  if (existing[0]) return existing[0];
  const [result] = await db.insert(mobileReminderSchedules).values({ enabled: true, urgentTimeSast: "08:00", dueTimeSast: "09:00" });
  const id = (result as unknown as { insertId: number }).insertId;
  const created = await db.select().from(mobileReminderSchedules).where(eq(mobileReminderSchedules.id, id)).limit(1);
  if (!created[0]) throw new Error("Could not create mobile reminder schedule");
  return created[0];
}

export async function getMobileReminderScheduleByTaskUid(taskUid: string): Promise<{ schedule: MobileReminderSchedule; kind: "urgent" | "due" } | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const urgentRows = await db.select().from(mobileReminderSchedules).where(eq(mobileReminderSchedules.urgentScheduleCronTaskUid, taskUid)).limit(1);
  if (urgentRows[0]) return { schedule: urgentRows[0], kind: "urgent" };
  const dueRows = await db.select().from(mobileReminderSchedules).where(eq(mobileReminderSchedules.dueScheduleCronTaskUid, taskUid)).limit(1);
  if (dueRows[0]) return { schedule: dueRows[0], kind: "due" };
  return undefined;
}

export async function updateMobileReminderSchedule(id: number, data: Partial<{ enabled: boolean; urgentScheduleCronTaskUid: string | null; dueScheduleCronTaskUid: string | null; lastUrgentDeliveryDate: string; lastDueDeliveryDate: string }>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(mobileReminderSchedules).set(data).where(eq(mobileReminderSchedules.id, id));
}

// ---- Tasks ----

export async function getTasksByCategory(categoryId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).where(eq(tasks.categoryId, categoryId)).orderBy(asc(tasks.sortOrder));
}

export async function getAllTasks() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).orderBy(asc(tasks.categoryId), asc(tasks.sortOrder));
}

export async function getTaskById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return result[0];
}

export async function createTask(data: { categoryId: number; parentId?: number; text: string; sortOrder: number; dueAt?: number | null; priority?: "high" | "medium" | "low"; recurrence?: TaskRecurrence; accountableDirectReportId?: number | null; mobileClientMutationId?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [result] = await db.insert(tasks).values({
    categoryId: data.categoryId,
    parentId: data.parentId,
    text: data.text,
    note: "",
    dueAt: data.dueAt ?? null,
    priority: data.priority ?? "medium",
    accountableDirectReportId: data.accountableDirectReportId ?? null,
    recurrence: data.recurrence ?? "none",
    mobileClientMutationId: data.mobileClientMutationId ?? null,
    done: false,
    collapsed: false,
    sortOrder: data.sortOrder,
  });
  return (result as unknown as { insertId: number }).insertId;
}

export async function getTaskByMobileClientMutationId(mobileClientMutationId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(tasks).where(eq(tasks.mobileClientMutationId, mobileClientMutationId)).limit(1);
  return rows[0];
}

export async function updateTask(id: number, data: Partial<{ text: string; note: string; dueAt: number | null; priority: "high" | "medium" | "low"; recurrence: TaskRecurrence; accountableDirectReportId: number | null; done: boolean; collapsed: boolean; sortOrder: number; categoryId: number; parentId: number | null }>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!existing) return;

  // Completing a repeating task means it is ready for its next occurrence.
  if (data.done === true && (data.recurrence ?? existing.recurrence) !== "none") {
    const recurrence = data.recurrence ?? existing.recurrence;
    await db.update(tasks).set({
      ...data,
      dueAt: nextRecurringDueAt(data.dueAt ?? existing.dueAt, recurrence),
      done: false,
    }).where(eq(tasks.id, id));
    return;
  }

  await db.update(tasks).set(data).where(eq(tasks.id, id));
}

export async function deleteTask(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Recursively delete children
  const children = await db.select().from(tasks).where(eq(tasks.parentId, id));
  for (const child of children) {
    await deleteTask(child.id);
  }
  await db.delete(tasks).where(eq(tasks.id, id));
}

// Cascade categoryId update to all descendants of a task
export async function cascadeCategoryId(taskId: number, newCategoryId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const children = await db.select().from(tasks).where(eq(tasks.parentId, taskId));
  for (const child of children) {
    await db.update(tasks).set({ categoryId: newCategoryId }).where(eq(tasks.id, child.id));
    await cascadeCategoryId(child.id, newCategoryId);
  }
}

// Get all descendant IDs of a task (for cycle detection)
export async function getDescendantIds(taskId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const children = await db.select().from(tasks).where(eq(tasks.parentId, taskId));
  const ids: number[] = [];
  for (const child of children) {
    ids.push(child.id);
    const subIds = await getDescendantIds(child.id);
    ids.push(...subIds);
  }
  return ids;
}

export async function getTopLevelTasks(categoryId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tasks).where(and(eq(tasks.categoryId, categoryId), isNull(tasks.parentId))).orderBy(asc(tasks.sortOrder));
}

// ---- Bulk import ----

export async function replaceAllData(
  newCategories: Array<{ name: string; kind: "urgent" | "normal"; colorIndex: number; sortOrder: number; collapsed: boolean }>,
  newTasks: Array<{ tempId: string; categoryIndex: number; parentTempId: string | null; text: string; note: string; dueAt: number | null; priority: "high" | "medium" | "low"; recurrence: TaskRecurrence; accountableDirectReportIndex: number | null; done: boolean; collapsed: boolean; sortOrder: number }>,
  newSavedFilters?: Array<{ name: string; priority: "all" | "high" | "medium" | "low"; dueRange: "all" | "today" | "this_week" | "next_7_days" | "overdue" | "no_due_date"; categoryIndex: number | null; includeCompleted: boolean; sortOrder: number }>,
  newDirectReports?: Array<{ name: string; sortOrder: number }>,
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Clear all
  await db.delete(tasks);
  await db.delete(categories);

  // Re-insert categories and build index map
  const catIds: number[] = [];
  for (const cat of newCategories) {
    const [result] = await db.insert(categories).values(cat);
    catIds.push((result as unknown as { insertId: number }).insertId);
  }

  const directReportIds: number[] = [];
  if (newDirectReports !== undefined) {
    await db.delete(directReports);
    for (const report of newDirectReports) {
      const [result] = await db.insert(directReports).values(report);
      directReportIds.push((result as unknown as { insertId: number }).insertId);
    }
  }

  // Re-insert tasks in order, tracking tempId -> real id for parent resolution
  const taskIdMap = new Map<string, number>();
  for (const task of newTasks) {
    const catId = catIds[task.categoryIndex];
    if (!catId) continue;
    const parentId = task.parentTempId ? taskIdMap.get(task.parentTempId) : undefined;
    const [result] = await db.insert(tasks).values({
      categoryId: catId,
      parentId,
      text: task.text,
      note: task.note,
      dueAt: task.dueAt,
      priority: task.priority,
      recurrence: task.recurrence,
      accountableDirectReportId: task.accountableDirectReportIndex === null ? null : (directReportIds[task.accountableDirectReportIndex] ?? null),
      done: task.done,
      collapsed: task.collapsed,
      sortOrder: task.sortOrder,
    });
    const newId = (result as unknown as { insertId: number }).insertId;
    taskIdMap.set(task.tempId, newId);
  }

  if (newSavedFilters !== undefined) {
    await db.delete(savedFilters);
    for (const filter of newSavedFilters) {
      await db.insert(savedFilters).values({
        name: filter.name,
        priority: filter.priority,
        dueRange: filter.dueRange,
        categoryId: filter.categoryIndex === null ? null : (catIds[filter.categoryIndex] ?? null),
        includeCompleted: filter.includeCompleted,
        sortOrder: filter.sortOrder,
      });
    }
  }
}
