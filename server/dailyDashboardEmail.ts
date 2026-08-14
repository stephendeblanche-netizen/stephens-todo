import type { Express, Request, Response } from "express";
import nodemailer from "nodemailer";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { buildDashboardExport } from "./dashboardExport";
import { createDashboardPdfReport } from "./dashboardPdfReport";
import { getDashboardEmailScheduleByTaskUid, markDashboardEmailScheduleSent } from "./db";

const formatExportDate = (date: Date) => date.toISOString().slice(0, 10);

export async function sendDailyDashboardExport(recipient: string, now = new Date()) {
  if (!ENV.gmailSmtpUser || !ENV.gmailSmtpAppPassword) {
    throw new Error("Gmail SMTP credentials are not configured.");
  }

  const snapshot = await buildDashboardExport();
  const exportDate = formatExportDate(now);
  const pdfReport = await createDashboardPdfReport(snapshot);
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: ENV.gmailSmtpUser,
      pass: ENV.gmailSmtpAppPassword.replace(/\s/g, ""),
    },
  });

  const info = await transporter.sendMail({
    from: `Stephen's To-Do Dashboard <${ENV.gmailSmtpUser}>`,
    to: recipient,
    subject: `Stephen's To-Do Dashboard export — ${exportDate}`,
    text: "Attached are a readable PDF task report and the daily JSON backup of Stephen's To-Do Dashboard. Use the PDF for reading and the JSON file only to restore a dashboard snapshot through the app's Import snapshot control.",
    attachments: [
      {
        filename: `stephens-todo-dashboard-report-${exportDate}.pdf`,
        content: pdfReport,
        contentType: "application/pdf",
      },
      {
        filename: `stephens-todo-dashboard-${exportDate}.json`,
        content: JSON.stringify(snapshot, null, 2),
        contentType: "application/json",
      },
    ],
  });

  return { messageId: info.messageId, exportDate };
}

export function registerDailyDashboardEmailRoute(app: Express) {
  app.post("/api/scheduled/daily-dashboard-export", async (req: Request, res: Response) => {
    let taskUid: string | undefined;
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) {
        return res.status(403).json({ error: "cron-only" });
      }
      taskUid = user.taskUid;
      const schedule = await getDashboardEmailScheduleByTaskUid(taskUid);
      if (!schedule || !schedule.enabled) {
        return res.json({ ok: true, skipped: "disabled-or-orphan" });
      }

      const delivery = await sendDailyDashboardExport(schedule.recipient);
      await markDashboardEmailScheduleSent(schedule.id);
      return res.json({ ok: true, delivery });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[Daily dashboard export]", { message, taskUid });
      return res.status(500).json({
        error: message,
        context: { path: req.path, taskUid: taskUid ?? null },
        timestamp: new Date().toISOString(),
      });
    }
  });
}
