import { bigint, boolean, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

// Core user table backing auth flow
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Categories table
export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  kind: mysqlEnum("kind", ["urgent", "normal"]).default("normal").notNull(),
  colorIndex: int("colorIndex").default(0).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  collapsed: boolean("collapsed").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

// Saved reusable combinations for task filtering.
export const savedFilters = mysqlTable("saved_filters", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  priority: mysqlEnum("priority", ["all", "high", "medium", "low"]).default("all").notNull(),
  dueRange: mysqlEnum("dueRange", ["all", "today", "this_week", "next_7_days", "overdue", "no_due_date"]).default("all").notNull(),
  categoryId: int("categoryId"),
  includeCompleted: boolean("includeCompleted").default(false).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SavedFilter = typeof savedFilters.$inferSelect;
export type InsertSavedFilter = typeof savedFilters.$inferInsert;

// People who can be accountable for tasks. A null task reference represents N/A.
export const directReports = mysqlTable("direct_reports", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DirectReport = typeof directReports.$inferSelect;
export type InsertDirectReport = typeof directReports.$inferInsert;

// Project-level configuration for the owner’s scheduled dashboard backup email.
export const dashboardEmailSchedules = mysqlTable("dashboard_email_schedules", {
  id: int("id").autoincrement().primaryKey(),
  sender: varchar("sender", { length: 320 }).notNull(),
  recipient: varchar("recipient", { length: 320 }).notNull(),
  deliveryTimeSast: varchar("deliveryTimeSast", { length: 5 }).default("19:00").notNull(),
  scheduleCronTaskUid: varchar("schedule_cron_task_uid", { length: 65 }),
  enabled: boolean("enabled").default(true).notNull(),
  lastSentAt: timestamp("lastSentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("dashboard_email_schedule_task_uid_idx").on(table.scheduleCronTaskUid),
]);

export type DashboardEmailSchedule = typeof dashboardEmailSchedules.$inferSelect;

// Registered iOS companion installations that have opted in to remote task reminders.
export const mobilePushDevices = mysqlTable("mobile_push_devices", {
  id: int("id").autoincrement().primaryKey(),
  installationId: varchar("installation_id", { length: 120 }).notNull(),
  expoPushToken: varchar("expo_push_token", { length: 255 }).notNull(),
  platform: varchar("platform", { length: 20 }).default("ios").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("mobile_push_devices_installation_uidx").on(table.installationId),
  uniqueIndex("mobile_push_devices_token_uidx").on(table.expoPushToken),
]);

export type MobilePushDevice = typeof mobilePushDevices.$inferSelect;

// One shared reminder configuration for Stephen's dashboard. Times are expressed in SAST.
export const mobileReminderSchedules = mysqlTable("mobile_reminder_schedules", {
  id: int("id").autoincrement().primaryKey(),
  enabled: boolean("enabled").default(true).notNull(),
  urgentTimeSast: varchar("urgent_time_sast", { length: 5 }).default("08:00").notNull(),
  dueTimeSast: varchar("due_time_sast", { length: 5 }).default("09:00").notNull(),
  urgentScheduleCronTaskUid: varchar("urgent_schedule_cron_task_uid", { length: 65 }),
  dueScheduleCronTaskUid: varchar("due_schedule_cron_task_uid", { length: 65 }),
  lastUrgentDeliveryDate: varchar("last_urgent_delivery_date", { length: 10 }),
  lastDueDeliveryDate: varchar("last_due_delivery_date", { length: 10 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("mobile_reminder_urgent_task_uid_idx").on(table.urgentScheduleCronTaskUid),
  index("mobile_reminder_due_task_uid_idx").on(table.dueScheduleCronTaskUid),
]);

export type MobileReminderSchedule = typeof mobileReminderSchedules.$inferSelect;

// Delegated Microsoft 365 connection for the signed-in dashboard owner. OAuth
// tokens are encrypted before persistence and never returned to the client.
export const microsoftConnections = mysqlTable("microsoft_connections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  accountId: varchar("account_id", { length: 128 }).notNull(),
  accountEmail: varchar("account_email", { length: 320 }),
  displayName: varchar("display_name", { length: 255 }),
  tokenCiphertext: text("token_ciphertext").notNull(),
  tokenExpiresAt: timestamp("token_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("microsoft_connections_user_uidx").on(table.userId),
]);

export type MicrosoftConnection = typeof microsoftConnections.$inferSelect;

// Links a task to its single Microsoft Outlook event so task updates replace
// the existing private/free event rather than creating duplicate appointments.
export const microsoftTaskEvents = mysqlTable("microsoft_task_events", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  taskId: int("task_id").notNull(),
  eventId: varchar("event_id", { length: 255 }).notNull(),
  webLink: text("web_link"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("microsoft_task_events_user_task_uidx").on(table.userId, table.taskId),
]);

// Records a user-selected Outlook message after it becomes a task, preventing
// accidental duplicate task creation from the same email.
export const microsoftEmailImports = mysqlTable("microsoft_email_imports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  messageId: varchar("message_id", { length: 255 }).notNull(),
  taskId: int("task_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("microsoft_email_imports_user_message_uidx").on(table.userId, table.messageId),
]);

export type MicrosoftEmailImport = typeof microsoftEmailImports.$inferSelect;

// Tasks table — supports unlimited nesting via parentId self-reference
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  categoryId: int("categoryId").notNull(),
  parentId: int("parentId"), // null = top-level task
  text: text("text").notNull(),
  note: varchar("note", { length: 2000 }).default("").notNull(),
  /** UTC Unix timestamp in milliseconds; null means no date has been set. */
  dueAt: bigint("dueAt", { mode: "number" }),
  /** Independent task importance; distinct from membership of the URGENT category. */
  priority: mysqlEnum("priority", ["high", "medium", "low"]).default("medium").notNull(),
  /** Null represents N/A (no direct-report accountability assigned). */
  accountableDirectReportId: int("accountableDirectReportId"),
  /** When completed, recurring tasks are advanced to their next due date instead of archived. */
  recurrence: mysqlEnum("recurrence", ["none", "daily", "weekly", "monthly"]).default("none").notNull(),
  /** Client-generated key used to make queued offline task creation safe to retry. */
  mobileClientMutationId: varchar("mobile_client_mutation_id", { length: 120 }),
  done: boolean("done").default(false).notNull(),
  collapsed: boolean("collapsed").default(false).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;
