import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import {
  getMicrosoftConnectionStatus,
  importMicrosoftMessageAsTask,
  listMicrosoftCalendarEvents,
  listMicrosoftMessages,
  sendMicrosoftEmail,
  syncTaskToMicrosoftEvent,
} from "./microsoftIntegration";
import { deleteMicrosoftConnection } from "./db";

export const microsoftRouter = router({
  status: adminProcedure.query(async ({ ctx }) => getMicrosoftConnectionStatus(ctx.user.id)),
  calendarEvents: adminProcedure
    .input(z.object({ startAt: z.string().datetime(), endAt: z.string().datetime() }))
    .query(async ({ ctx, input }) => {
      const startAt = new Date(input.startAt);
      const endAt = new Date(input.endAt);
      if (endAt <= startAt || endAt.getTime() - startAt.getTime() > 93 * 24 * 60 * 60 * 1000) {
        throw new Error("Choose a calendar range of up to 93 days.");
      }
      return listMicrosoftCalendarEvents(ctx.user.id, startAt, endAt);
    }),
  inbox: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(25) }).default({ limit: 25 }))
    .query(async ({ ctx, input }) => listMicrosoftMessages(ctx.user.id, input.limit)),
  syncTaskEvent: adminProcedure
    .input(z.object({ taskId: z.number().int() }))
    .mutation(async ({ ctx, input }) => syncTaskToMicrosoftEvent(ctx.user.id, input.taskId)),
  importEmailAsTask: adminProcedure
    .input(z.object({ messageId: z.string().min(1).max(255), categoryId: z.number().int() }))
    .mutation(async ({ ctx, input }) => importMicrosoftMessageAsTask(ctx.user.id, input.messageId, input.categoryId)),
  sendEmail: adminProcedure
    .input(z.object({
      to: z.array(z.string().trim().email().max(320)).min(1).max(20),
      cc: z.array(z.string().trim().email().max(320)).max(20).default([]),
      subject: z.string().trim().min(1).max(255),
      body: z.string().trim().min(1).max(10_000),
      confirmed: z.literal(true),
    }))
    .mutation(async ({ ctx, input }) => sendMicrosoftEmail(ctx.user.id, input)),
  disconnect: adminProcedure.mutation(async ({ ctx }) => {
    await deleteMicrosoftConnection(ctx.user.id);
    return { success: true };
  }),
});
