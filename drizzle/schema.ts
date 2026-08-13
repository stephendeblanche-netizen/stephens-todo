import { bigint, boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
  done: boolean("done").default(false).notNull(),
  collapsed: boolean("collapsed").default(false).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;
