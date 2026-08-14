import PDFDocument from "pdfkit";
import type { buildDashboardExport } from "./dashboardExport";

type DashboardExport = Awaited<ReturnType<typeof buildDashboardExport>>;

const REPORT_MARGIN = 48;

function dueDateLabel(dueAt: number | null) {
  if (!dueAt) return null;
  return new Date(dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function addTaskLine(doc: PDFKit.PDFDocument, text: string, depth: number, options: { color?: string; size?: number; indent?: number } = {}) {
  const left = REPORT_MARGIN + depth * 18 + (options.indent ?? 0);
  if (doc.y > doc.page.height - 78) doc.addPage();
  doc.fillColor(options.color ?? "#172033").fontSize(options.size ?? 9.5).text(text, left, doc.y, {
    width: doc.page.width - left - REPORT_MARGIN,
    lineGap: 2,
  });
}

export async function createDashboardPdfReport(snapshot: DashboardExport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: REPORT_MARGIN, size: "A4", info: { Title: "Stephen's To-Do Dashboard" } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const totalTasks = snapshot.tasks.length;
    const completedTasks = snapshot.tasks.filter((task) => task.done).length;
    const highPriority = snapshot.tasks.filter((task) => task.priority === "high" && !task.done).length;

    doc.fillColor("#172033").fontSize(20).font("Helvetica-Bold").text("Stephen's To-Do Dashboard");
    doc.moveDown(0.25);
    doc.fillColor("#536174").fontSize(9.5).font("Helvetica").text(`Daily report generated ${new Date(snapshot.exportedAt).toLocaleString("en-GB")}`);
    doc.moveDown(1);

    doc.fillColor("#172033").fontSize(12).font("Helvetica-Bold").text("Overview");
    doc.moveDown(0.25);
    doc.font("Helvetica").fontSize(10).fillColor("#344054").text(
      `${totalTasks} tasks  |  ${completedTasks} completed  |  ${totalTasks - completedTasks} open  |  ${highPriority} high priority open`,
    );
    doc.moveDown(1.1);

    const tasksByCategory = new Map<number, DashboardExport["tasks"]>();
    for (const task of snapshot.tasks) {
      tasksByCategory.set(task.categoryId, [...(tasksByCategory.get(task.categoryId) ?? []), task]);
    }

    for (const category of snapshot.categories) {
      const categoryTasks = (tasksByCategory.get(category.id) ?? []).sort((left, right) => left.sortOrder - right.sortOrder);
      if (doc.y > doc.page.height - 110) doc.addPage();
      doc.fillColor(category.kind === "urgent" ? "#b42318" : "#172033").fontSize(13).font("Helvetica-Bold").text(category.name);
      doc.moveDown(0.25);

      if (categoryTasks.length === 0) {
        doc.fillColor("#667085").font("Helvetica-Oblique").fontSize(9).text("No tasks.", REPORT_MARGIN + 2);
        doc.moveDown(0.7);
        continue;
      }

      const byParent = new Map<number | null, DashboardExport["tasks"]>();
      for (const task of categoryTasks) {
        const parentId = task.parentId ?? null;
        byParent.set(parentId, [...(byParent.get(parentId) ?? []), task]);
      }

      const renderTasks = (parentId: number | null, depth: number) => {
        for (const task of (byParent.get(parentId) ?? []).sort((left, right) => left.sortOrder - right.sortOrder)) {
          const status = task.done ? "[x]" : "[ ]";
          addTaskLine(doc, `${status} ${task.text}`, depth, { color: task.done ? "#667085" : "#172033", size: 9.7 });
          const metadata = [
            task.priority.toUpperCase(),
            dueDateLabel(task.dueAt) ? `Due ${dueDateLabel(task.dueAt)}` : null,
            task.recurrence !== "none" ? `Repeats ${task.recurrence}` : null,
          ].filter(Boolean).join("  ·  ");
          if (metadata) addTaskLine(doc, metadata, depth, { color: "#667085", size: 7.8, indent: 18 });
          if (task.note) addTaskLine(doc, `Note: ${task.note}`, depth, { color: "#475467", size: 8.2, indent: 18 });
          renderTasks(task.id, depth + 1);
        }
      };

      renderTasks(null, 0);
      doc.moveDown(0.9);
    }

    doc.end();
  });
}
