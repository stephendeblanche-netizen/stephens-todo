import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  getAllCategories,
  getAllTasks,
  createCategory,
  updateCategory,
  deleteCategory,
  createTask,
  updateTask,
  deleteTask,
  replaceAllData,
} from "./db";
import { cascadeCategoryId, getDescendantIds } from "./db";
import { eq, and, isNull } from "drizzle-orm";
import { tasks as tasksTable } from "../drizzle/schema";
import { getDb } from "./db";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ---- Categories ----
  categories: router({
    list: publicProcedure.query(async () => {
      return getAllCategories();
    }),

    create: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        kind: z.enum(["urgent", "normal"]).default("normal"),
        colorIndex: z.number().int().min(0).max(7).default(0),
        sortOrder: z.number().int().default(0),
      }))
      .mutation(async ({ input }) => {
        const id = await createCategory(input);
        return { id };
      }),

    update: publicProcedure
      .input(z.object({
        id: z.number().int(),
        name: z.string().min(1).optional(),
        kind: z.enum(["urgent", "normal"]).optional(),
        colorIndex: z.number().int().min(0).max(7).optional(),
        sortOrder: z.number().int().optional(),
        collapsed: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateCategory(id, data);
        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteCategory(input.id);
        return { success: true };
      }),

    reorder: publicProcedure
      .input(z.array(z.object({ id: z.number().int(), sortOrder: z.number().int() })))
      .mutation(async ({ input }) => {
        for (const item of input) {
          await updateCategory(item.id, { sortOrder: item.sortOrder });
        }
        return { success: true };
      }),
  }),

  // ---- Tasks ----
  tasks: router({
    listAll: publicProcedure.query(async () => {
      return getAllTasks();
    }),

    create: publicProcedure
      .input(z.object({
        categoryId: z.number().int(),
        parentId: z.number().int().optional(),
        text: z.string().default("New item"),
        sortOrder: z.number().int().default(0),
      }))
      .mutation(async ({ input }) => {
        const id = await createTask(input);
        return { id };
      }),

    update: publicProcedure
      .input(z.object({
        id: z.number().int(),
        text: z.string().optional(),
        note: z.string().optional(),
        done: z.boolean().optional(),
        collapsed: z.boolean().optional(),
        sortOrder: z.number().int().optional(),
        categoryId: z.number().int().optional(),
        parentId: z.number().int().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateTask(id, data);
        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        await deleteTask(input.id);
        return { success: true };
      }),

    clearCompleted: publicProcedure
      .input(z.object({ categoryId: z.number().int() }))
      .mutation(async ({ input }) => {
        const allTasks = await getAllTasks();
        const catTasks = allTasks.filter((t) => t.categoryId === input.categoryId);

        // Helper: does a task have any undone descendants?
        function hasUndoneDescendant(taskId: number): boolean {
          const children = catTasks.filter((t) => t.parentId === taskId);
          for (const child of children) {
            if (!child.done) return true;
            if (hasUndoneDescendant(child.id)) return true;
          }
          return false;
        }

        // Only delete done tasks that have NO undone descendants
        // (so we don't silently wipe incomplete sub-items)
        const toDelete = catTasks.filter((t) => t.done && !hasUndoneDescendant(t.id));

        let deleted = 0;
        for (const task of toDelete) {
          // Check it hasn't already been removed as a child of a previously deleted task
          const current = (await getAllTasks()).find((t) => t.id === task.id);
          if (current) { await deleteTask(task.id); deleted++; }
        }
        return { success: true, deleted };
      }),

    reorder: publicProcedure
      .input(z.array(z.object({ id: z.number().int(), sortOrder: z.number().int(), parentId: z.number().int().nullable().optional(), categoryId: z.number().int().optional() })))
      .mutation(async ({ input }) => {
        for (const item of input) {
          // Cycle protection: if re-parenting, ensure new parentId is not a descendant
          if (item.parentId !== undefined && item.parentId !== null) {
            const descendants = await getDescendantIds(item.id);
            if (descendants.includes(item.parentId)) {
              // Skip this move — would create a cycle
              continue;
            }
          }

          const oldTask = await (async () => {
            const db = await getDb();
            if (!db) return null;
            const rows = await db.select().from(tasksTable).where(eq(tasksTable.id, item.id)).limit(1);
            return rows[0] ?? null;
          })();

          const newCategoryId = item.categoryId ?? oldTask?.categoryId;
          const newParentId = item.parentId !== undefined ? item.parentId : (oldTask?.parentId ?? null);

          await updateTask(item.id, {
            sortOrder: item.sortOrder,
            ...(item.parentId !== undefined ? { parentId: item.parentId } : {}),
            ...(item.categoryId !== undefined ? { categoryId: item.categoryId } : {}),
          });

          // Cascade categoryId change to all descendants
          if (newCategoryId && newCategoryId !== oldTask?.categoryId) {
            await cascadeCategoryId(item.id, newCategoryId);
          }

          // Normalise source siblings: reindex sortOrder after removal
          if (oldTask && (newCategoryId !== oldTask.categoryId || newParentId !== (oldTask.parentId ?? null))) {
            const db = await getDb();
            if (db) {
              const sourceSiblings = await db.select().from(tasksTable)
                .where(
                  oldTask.parentId !== null
                    ? and(eq(tasksTable.categoryId, oldTask.categoryId), eq(tasksTable.parentId, oldTask.parentId!))
                    : and(eq(tasksTable.categoryId, oldTask.categoryId), isNull(tasksTable.parentId))
                );
              const sorted = sourceSiblings
                .filter((s) => s.id !== item.id)
                .sort((a, b) => a.sortOrder - b.sortOrder);
              for (let i = 0; i < sorted.length; i++) {
                if (sorted[i].sortOrder !== i) {
                  await updateTask(sorted[i].id, { sortOrder: i });
                }
              }
            }
          }
        }
        return { success: true };
      }),
  }),

  // ---- Export / Import ----
  data: router({
    export: publicProcedure.query(async () => {
      const cats = await getAllCategories();
      const allTasks = await getAllTasks();
      return { categories: cats, tasks: allTasks, exportedAt: new Date().toISOString() };
    }),

    import: publicProcedure
      .input(z.object({
        categories: z.array(z.object({
          name: z.string(),
          kind: z.enum(["urgent", "normal"]),
          colorIndex: z.number().int(),
          sortOrder: z.number().int(),
          collapsed: z.boolean(),
        })),
        tasks: z.array(z.object({
          tempId: z.string(),
          categoryIndex: z.number().int(),
          parentTempId: z.string().nullable(),
          text: z.string(),
          note: z.string(),
          done: z.boolean(),
          collapsed: z.boolean(),
          sortOrder: z.number().int(),
        })),
      }))
      .mutation(async ({ input }) => {
        await replaceAllData(input.categories, input.tasks);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
