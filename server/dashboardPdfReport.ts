import PDFDocument from "pdfkit";
import type { buildDashboardExport } from "./dashboardExport";

type DashboardExport = Awaited<ReturnType<typeof buildDashboardExport>>;
type SnapshotTask = DashboardExport["tasks"][number];
type SnapshotCategory = DashboardExport["categories"][number];

const REPORT_MARGIN = 42;
const HEADER_HEIGHT = 76;
// Leave enough vertical room for the visible footer within PDFKit's printable
// area. Rendering footer text below the bottom margin makes PDFKit append a
// page automatically, which previously created one blank page per report page.
const FOOTER_RESERVE = 72;
const SECTION_GAP = 14;

const COLORS = {
  ink: "#172033",
  body: "#344054",
  muted: "#667085",
  soft: "#F4F7FB",
  line: "#D9E2EC",
  blue: "#285A9F",
  blueSoft: "#EAF2FD",
  red: "#B42318",
  redSoft: "#FDEDEC",
  green: "#177245",
  amber: "#9A6700",
  white: "#FFFFFF",
} as const;

export type DashboardReportTask = {
  task: SnapshotTask;
  depth: number;
  dueDate: string | null;
  recurrenceLabel: string | null;
  responsibleColleagues: string[];
};

export type DashboardReportSection = {
  category: SnapshotCategory;
  tasks: DashboardReportTask[];
  total: number;
  completed: number;
  open: number;
  highPriorityOpen: number;
};

export type DashboardReportModel = {
  generatedAt: Date;
  summary: {
    total: number;
    open: number;
    completed: number;
    highPriorityOpen: number;
    categories: number;
  };
  sections: DashboardReportSection[];
};

function dueDateLabel(dueAt: number | null) {
  if (!dueAt) return null;
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(dueAt));
}

function reportDateLabel(date: Date) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

function responsibleColleagueIds(task: SnapshotTask): number[] {
  const ids = task.responsibleColleagueIds;
  if (Array.isArray(ids)) return ids;
  return task.accountableDirectReportId === null ? [] : [task.accountableDirectReportId];
}

function recurrenceLabel(recurrence: SnapshotTask["recurrence"]): string | null {
  if (recurrence === "none") return null;
  return `Repeats ${recurrence}`;
}

function sortTasks<T extends SnapshotTask>(tasks: T[]): T[] {
  return [...tasks].sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
}

/**
 * Produces a rendering-neutral report model so the PDF keeps hierarchy, notes,
 * completion state and current multi-person Responsible Colleague assignments.
 */
export function buildDashboardReportModel(snapshot: DashboardExport): DashboardReportModel {
  const colleagueNameById = new Map(snapshot.directReports.map((report) => [report.id, report.name]));
  const tasksByCategory = new Map<number, SnapshotTask[]>();

  for (const task of snapshot.tasks) {
    tasksByCategory.set(task.categoryId, [...(tasksByCategory.get(task.categoryId) ?? []), task]);
  }

  const sections = [...snapshot.categories]
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id)
    .map((category) => {
      const categoryTasks = sortTasks(tasksByCategory.get(category.id) ?? []);
      const taskById = new Map(categoryTasks.map((task) => [task.id, task]));
      const childrenByParent = new Map<number | null, SnapshotTask[]>();

      for (const task of categoryTasks) {
        // Treat malformed or cross-category parent references as a root so no task is hidden.
        const parentId = task.parentId !== null && taskById.has(task.parentId) ? task.parentId : null;
        childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), task]);
      }

      const rows: DashboardReportTask[] = [];
      const visited = new Set<number>();
      const appendBranch = (parentId: number | null, depth: number) => {
        for (const task of sortTasks(childrenByParent.get(parentId) ?? [])) {
          if (visited.has(task.id)) continue;
          visited.add(task.id);
          rows.push({
            task,
            depth,
            dueDate: dueDateLabel(task.dueAt),
            recurrenceLabel: recurrenceLabel(task.recurrence),
            responsibleColleagues: responsibleColleagueIds(task)
              .map((id) => colleagueNameById.get(id))
              .filter((name): name is string => Boolean(name)),
          });
          appendBranch(task.id, depth + 1);
        }
      };

      appendBranch(null, 0);
      // A corrupt cycle should not suppress the affected tasks from the report.
      for (const task of categoryTasks) {
        if (visited.has(task.id)) continue;
        visited.add(task.id);
        rows.push({
          task,
          depth: 0,
          dueDate: dueDateLabel(task.dueAt),
          recurrenceLabel: recurrenceLabel(task.recurrence),
          responsibleColleagues: responsibleColleagueIds(task)
            .map((id) => colleagueNameById.get(id))
            .filter((name): name is string => Boolean(name)),
        });
        appendBranch(task.id, 1);
      }

      const completed = categoryTasks.filter((task) => task.done).length;
      const highPriorityOpen = categoryTasks.filter((task) => !task.done && task.priority === "high").length;
      return {
        category,
        tasks: rows,
        total: categoryTasks.length,
        completed,
        open: categoryTasks.length - completed,
        highPriorityOpen,
      } satisfies DashboardReportSection;
    });

  const total = snapshot.tasks.length;
  const completed = snapshot.tasks.filter((task) => task.done).length;
  return {
    generatedAt: new Date(snapshot.exportedAt),
    summary: {
      total,
      completed,
      open: total - completed,
      highPriorityOpen: snapshot.tasks.filter((task) => !task.done && task.priority === "high").length,
      categories: snapshot.categories.length,
    },
    sections,
  };
}

function addReportPage(doc: PDFKit.PDFDocument) {
  doc.addPage();
  doc.x = REPORT_MARGIN;
  doc.y = HEADER_HEIGHT;
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number) {
  if (doc.y + height > doc.page.height - FOOTER_RESERVE) addReportPage(doc);
}

function drawSummaryCard(doc: PDFKit.PDFDocument, x: number, y: number, width: number, label: string, value: number, accent: string) {
  doc.roundedRect(x, y, width, 53, 7).fill(COLORS.soft);
  doc.roundedRect(x, y, 4, 53, 2).fill(accent);
  doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(7.2).text(label.toUpperCase(), x + 12, y + 10, { width: width - 18 });
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(18).text(String(value), x + 12, y + 23, { width: width - 18 });
}

function priorityColor(priority: SnapshotTask["priority"]) {
  if (priority === "high") return COLORS.red;
  if (priority === "low") return COLORS.green;
  return COLORS.amber;
}

function drawStatusMark(doc: PDFKit.PDFDocument, x: number, y: number, done: boolean) {
  doc.lineWidth(1);
  doc.roundedRect(x, y, 11, 11, 2).lineWidth(1).strokeColor(done ? COLORS.green : COLORS.line).stroke();
  if (done) {
    doc.moveTo(x + 2.2, y + 5.7).lineTo(x + 4.6, y + 8.2).lineTo(x + 9, y + 2.8).lineWidth(1.25).strokeColor(COLORS.green).stroke();
  }
}

function drawPriorityPill(doc: PDFKit.PDFDocument, label: string, x: number, y: number, color: string) {
  const width = doc.font("Helvetica-Bold").fontSize(6.7).widthOfString(label) + 12;
  doc.roundedRect(x, y, width, 14, 7).fillColor(color).fill();
  doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(6.7).text(label, x + 6, y + 3.5, { width: width - 12, lineBreak: false });
  return width;
}

function taskMetadata(row: DashboardReportTask) {
  const { task } = row;
  return [
    task.done ? "Completed" : "Open",
    row.dueDate ? `Due ${row.dueDate}` : "No due date",
    row.recurrenceLabel,
    row.responsibleColleagues.length > 0 ? `Responsible: ${row.responsibleColleagues.join(", ")}` : "Responsible: N/A",
  ].filter((value): value is string => Boolean(value)).join("  •  ");
}

function estimateTaskHeight(doc: PDFKit.PDFDocument, row: DashboardReportTask, availableWidth: number) {
  const titleHeight = doc.font("Helvetica-Bold").fontSize(10).heightOfString(row.task.text, { width: availableWidth });
  const metadataHeight = doc.font("Helvetica").fontSize(7.8).heightOfString(taskMetadata(row), { width: availableWidth });
  const noteHeight = row.task.note.trim()
    ? doc.font("Helvetica-Oblique").fontSize(8.2).heightOfString(`Note — ${row.task.note.trim()}`, { width: availableWidth }) + 5
    : 0;
  return Math.max(20, titleHeight) + metadataHeight + noteHeight + 16;
}

function renderTask(doc: PDFKit.PDFDocument, row: DashboardReportTask) {
  const indent = row.depth * 15;
  const cardX = REPORT_MARGIN + indent;
  const cardWidth = doc.page.width - REPORT_MARGIN - cardX;
  const contentX = cardX + 26;
  const contentWidth = cardWidth - 36;
  const estimatedHeight = estimateTaskHeight(doc, row, contentWidth);
  ensureSpace(doc, estimatedHeight + 3);

  const y = doc.y;
  const priority = row.task.priority.toUpperCase();
  doc.roundedRect(cardX, y, cardWidth, estimatedHeight, 6).fillColor(row.task.done ? "#FAFBFC" : COLORS.white).fill();
  if (row.depth > 0) {
    doc.roundedRect(cardX, y, 3, estimatedHeight, 2).fillColor(COLORS.blue).fill();
  }

  drawStatusMark(doc, cardX + 9, y + 10, row.task.done);
  const pillWidth = drawPriorityPill(doc, priority, contentX, y + 8, priorityColor(row.task.priority));
  const titleX = contentX + pillWidth + 7;
  const titleWidth = contentX + contentWidth - titleX;
  const titleY = y + 9;
  const titleHeight = doc
    .fillColor(row.task.done ? COLORS.muted : COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(row.task.text, titleX, titleY, { width: titleWidth, lineGap: 1 })
    .heightOfString(row.task.text, { width: titleWidth, lineGap: 1 });

  const metadataY = titleY + Math.max(titleHeight, 14) + 3;
  const metadata = taskMetadata(row);
  const metadataHeight = doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(7.8)
    .text(metadata, contentX, metadataY, { width: contentWidth, lineGap: 1 })
    .heightOfString(metadata, { width: contentWidth, lineGap: 1 });

  let finalY = metadataY + metadataHeight;
  const note = row.task.note.trim();
  if (note) {
    finalY += 5;
    const noteHeight = doc
      .fillColor(COLORS.body)
      .font("Helvetica-Oblique")
      .fontSize(8.2)
      .text(`Note — ${note}`, contentX, finalY, { width: contentWidth, lineGap: 1.4 })
      .heightOfString(`Note — ${note}`, { width: contentWidth, lineGap: 1.4 });
    finalY += noteHeight;
  }

  doc.y = Math.max(y + estimatedHeight, finalY + 9) + 4;
  doc.x = REPORT_MARGIN;
}

function renderSection(doc: PDFKit.PDFDocument, section: DashboardReportSection) {
  ensureSpace(doc, 62);
  const accent = section.category.kind === "urgent" ? COLORS.red : COLORS.blue;
  const softAccent = section.category.kind === "urgent" ? COLORS.redSoft : COLORS.blueSoft;
  const y = doc.y;
  const contentWidth = doc.page.width - REPORT_MARGIN * 2;

  doc.roundedRect(REPORT_MARGIN, y, contentWidth, 48, 7).fillColor(softAccent).fill();
  doc.roundedRect(REPORT_MARGIN, y, 5, 48, 2).fillColor(accent).fill();
  doc.fillColor(accent).font("Helvetica-Bold").fontSize(7.5).text(section.category.kind === "urgent" ? "URGENT SECTION" : "TASK SECTION", REPORT_MARGIN + 15, y + 9);
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(12.5).text(section.category.name, REPORT_MARGIN + 15, y + 20, { width: contentWidth - 180, lineBreak: false });
  doc.fillColor(COLORS.body).font("Helvetica").fontSize(8).text(
    `${section.open} open  •  ${section.completed} completed  •  ${section.highPriorityOpen} high priority`,
    REPORT_MARGIN + 15,
    y + 35,
    { width: contentWidth - 30, lineBreak: false },
  );
  doc.y = y + 58;

  if (section.tasks.length === 0) {
    ensureSpace(doc, 30);
    doc.fillColor(COLORS.muted).font("Helvetica-Oblique").fontSize(8.8).text("No tasks recorded in this section.", REPORT_MARGIN + 4, doc.y + 4);
    doc.moveDown(1.1);
    return;
  }

  for (const row of section.tasks) renderTask(doc, row);
  doc.moveDown(0.35);
}

function decoratePages(doc: PDFKit.PDFDocument, reportDate: string) {
  const pageRange = doc.bufferedPageRange();
  for (let page = pageRange.start; page < pageRange.start + pageRange.count; page += 1) {
    doc.switchToPage(page);
    doc.rect(0, 0, doc.page.width, HEADER_HEIGHT - 16).fillColor(COLORS.ink).fill();
    doc.fillColor(COLORS.white).font("Helvetica-Bold").fontSize(10).text("STEPHEN'S TO-DO", REPORT_MARGIN, 22, { lineBreak: false });
    doc.fillColor("#CBD5E1").font("Helvetica").fontSize(7.2).text("TASK MANAGEMENT REPORT", REPORT_MARGIN, 36, { lineBreak: false });
    doc.fillColor("#CBD5E1").font("Helvetica").fontSize(7.2).text(reportDate, REPORT_MARGIN, 48, {
      width: doc.page.width - REPORT_MARGIN * 2,
      align: "right",
      lineBreak: false,
    });

    const footerY = doc.page.height - REPORT_MARGIN - 16;
    doc.moveTo(REPORT_MARGIN, footerY - 6).lineTo(doc.page.width - REPORT_MARGIN, footerY - 6).lineWidth(0.6).strokeColor(COLORS.line).stroke();
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.1).text("Stephen's To-Do Dashboard • Confidential task summary", REPORT_MARGIN, footerY, { lineBreak: false });
    doc.text(`Page ${page + 1} of ${pageRange.count}`, REPORT_MARGIN, footerY, {
      width: doc.page.width - REPORT_MARGIN * 2,
      align: "right",
      lineBreak: false,
    });
  }
}

export async function createDashboardPdfReport(snapshot: DashboardExport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const model = buildDashboardReportModel(snapshot);
    const doc = new PDFDocument({
      margin: REPORT_MARGIN,
      size: "A4",
      bufferPages: true,
      info: {
        Title: "Stephen's To-Do Dashboard — Task Management Report",
        Author: "Stephen's To-Do Dashboard",
        Subject: "Task summary by section",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.x = REPORT_MARGIN;
    doc.y = HEADER_HEIGHT;
    doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(20).text("Task management report");
    doc.moveDown(0.25);
    doc.fillColor(COLORS.body).font("Helvetica").fontSize(9).text("A concise, section-by-section summary of current tasks, ownership and delivery commitments.");
    doc.moveDown(0.95);

    const cardGap = 9;
    const contentWidth = doc.page.width - REPORT_MARGIN * 2;
    const cardWidth = (contentWidth - cardGap * 3) / 4;
    const cardY = doc.y;
    drawSummaryCard(doc, REPORT_MARGIN, cardY, cardWidth, "Total tasks", model.summary.total, COLORS.blue);
    drawSummaryCard(doc, REPORT_MARGIN + (cardWidth + cardGap), cardY, cardWidth, "Open", model.summary.open, COLORS.blue);
    drawSummaryCard(doc, REPORT_MARGIN + (cardWidth + cardGap) * 2, cardY, cardWidth, "Completed", model.summary.completed, COLORS.green);
    drawSummaryCard(doc, REPORT_MARGIN + (cardWidth + cardGap) * 3, cardY, cardWidth, "High priority open", model.summary.highPriorityOpen, COLORS.red);
    doc.y = cardY + 69;
    doc.x = REPORT_MARGIN;
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8).text(`${model.summary.categories} sections • Includes task hierarchy, status, priority, due dates, recurring schedules, Responsible Colleagues and relevant notes.`);
    doc.moveDown(1.15);

    for (const section of model.sections) {
      renderSection(doc, section);
      doc.y += SECTION_GAP;
    }

    decoratePages(doc, reportDateLabel(model.generatedAt));
    doc.end();
  });
}
