import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, FileText, Flag, ListTree, Paperclip, Repeat2, Save, StickyNote, Upload, UserRound, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Category, DirectReport, Task } from "../../../drizzle/schema";

type ComplexTaskInput = {
  categoryId: number;
  parentId?: number;
  text: string;
  sortOrder: number;
  dueAt: number | null;
  priority: "high" | "medium" | "low";
  recurrence: "none" | "daily" | "weekly" | "monthly";
  responsibleColleagueIds: number[];
  note: string;
};

type ComplexTaskDialogProps = {
  open: boolean;
  categories: Category[];
  tasks: Task[];
  directReports: DirectReport[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (task: ComplexTaskInput, attachments: File[]) => void;
};

const priorityStyles = {
  high: { color: "var(--status-critical)", label: "High" },
  medium: { color: "var(--slot-5)", label: "Medium" },
  low: { color: "var(--status-good)", label: "Low" },
} as const;

function localDueTimestamp(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ComplexTaskDialog({
  open,
  categories,
  tasks,
  directReports,
  saving,
  onOpenChange,
  onSave,
}: ComplexTaskDialogProps) {
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [parentId, setParentId] = useState<number | null>(null);
  const [priority, setPriority] = useState<ComplexTaskInput["priority"]>("medium");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState<ComplexTaskInput["recurrence"]>("none");
  const [responsibleColleagueIds, setResponsibleColleagueIds] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [validationMessage, setValidationMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setCategoryId(categories[0]?.id ?? null);
    setParentId(null);
    setPriority("medium");
    setDueDate("");
    setRecurrence("none");
    setResponsibleColleagueIds([]);
    setNote("");
    setAttachments([]);
    setValidationMessage("");
  }, [open, categories]);

  const parentTasks = useMemo(
    () => tasks
      .filter((task) => task.categoryId === categoryId)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id),
    [categoryId, tasks],
  );

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const additions = Array.from(fileList);
    const duplicateKeys = new Set(attachments.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
    const uniqueAdditions = additions.filter((file) => !duplicateKeys.has(`${file.name}:${file.size}:${file.lastModified}`));
    setAttachments((current) => [...current, ...uniqueAdditions]);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setValidationMessage("Add a clear task title before saving.");
      return;
    }
    if (!categoryId) {
      setValidationMessage("Choose a category for this task.");
      return;
    }
    const siblingCount = tasks.filter((task) => task.categoryId === categoryId && (task.parentId ?? null) === parentId).length;
    onSave({
      categoryId,
      ...(parentId ? { parentId } : {}),
      text: trimmedTitle,
      sortOrder: siblingCount,
      dueAt: localDueTimestamp(dueDate),
      priority,
      recurrence,
      responsibleColleagueIds,
      note: note.trim(),
    }, attachments);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!saving) onOpenChange(nextOpen); }}>
      <DialogContent
        showCloseButton={false}
        className="inset-0 h-dvh max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none"
        aria-describedby="complex-task-description"
      >
        <form onSubmit={submit} className="flex h-full min-h-0 flex-col" aria-label="Create detailed task">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4 sm:px-8" style={{ background: "var(--card-surface)", borderColor: "var(--border-color)" }}>
            <div>
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--slot-1)" }}>Detailed capture</p>
              <DialogTitle className="mt-1 text-[22px]" style={{ color: "var(--text-primary)" }}>Create a detailed task</DialogTitle>
              <DialogDescription id="complex-task-description" className="mt-1 max-w-2xl text-[12px]" style={{ color: "var(--text-secondary)" }}>
                Capture the task, delivery context, ownership, schedule, notes, and supporting documents in one place.
              </DialogDescription>
            </div>
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border"
              style={{ color: "var(--text-secondary)", background: "var(--page-plane)", borderColor: "var(--border-color)" }}
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close detailed task form"
              disabled={saving}
            >
              <X size={18} />
            </button>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8">
            <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(290px,0.8fr)]">
              <section className="space-y-5">
                <div className="rounded-2xl border p-4 sm:p-5" style={{ background: "var(--card-surface)", borderColor: "var(--border-color)" }}>
                  <div className="mb-4 flex items-center gap-2">
                    <ListTree size={16} style={{ color: "var(--slot-1)" }} />
                    <h2 className="m-0 text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Task context</h2>
                  </div>
                  <label className="block text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                    What needs to be done?
                    <input
                      autoFocus
                      className="mt-1.5 w-full rounded-xl border px-3 py-2.5 text-[15px] font-[inherit] focus:outline-none"
                      style={{ background: "var(--page-plane)", color: "var(--text-primary)", borderColor: "var(--border-color)" }}
                      value={title}
                      onChange={(event) => { setTitle(event.target.value); setValidationMessage(""); }}
                      placeholder="Describe the outcome or action…"
                      aria-label="Detailed task title"
                    />
                  </label>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                      Category
                      <select
                        className="mt-1.5 h-10 w-full rounded-xl border px-3 text-[12px] font-[inherit]"
                        style={{ background: "var(--page-plane)", color: "var(--text-primary)", borderColor: "var(--border-color)" }}
                        value={categoryId ?? ""}
                        onChange={(event) => { setCategoryId(Number(event.target.value)); setParentId(null); }}
                        aria-label="Detailed task category"
                      >
                        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                    </label>
                    <label className="text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                      Parent task <span className="font-normal">(optional)</span>
                      <select
                        className="mt-1.5 h-10 w-full rounded-xl border px-3 text-[12px] font-[inherit]"
                        style={{ background: "var(--page-plane)", color: "var(--text-primary)", borderColor: "var(--border-color)" }}
                        value={parentId ?? ""}
                        onChange={(event) => setParentId(event.target.value ? Number(event.target.value) : null)}
                        aria-label="Detailed task parent task"
                      >
                        <option value="">No parent — create a main task</option>
                        {parentTasks.map((task) => <option key={task.id} value={task.id}>{task.text}</option>)}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="rounded-2xl border p-4 sm:p-5" style={{ background: "var(--card-surface)", borderColor: "var(--border-color)" }}>
                  <div className="mb-4 flex items-center gap-2"><StickyNote size={16} style={{ color: "var(--slot-1)" }} /><h2 className="m-0 text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Notes and supporting material</h2></div>
                  <label className="block text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                    Context, decisions, or next steps
                    <textarea
                      className="mt-1.5 min-h-40 w-full resize-y rounded-xl border px-3 py-2.5 text-[13px] font-[inherit] focus:outline-none"
                      style={{ background: "var(--page-plane)", color: "var(--text-primary)", borderColor: "var(--border-color)" }}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Record context, dependencies, decisions, or a definition of done…"
                      aria-label="Detailed task notes"
                    />
                  </label>
                  <div className="mt-4 rounded-xl border border-dashed p-3" style={{ background: "var(--page-plane)", borderColor: "var(--border-color)" }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2"><Paperclip size={15} style={{ color: "var(--slot-1)" }} /><div><p className="m-0 text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>Attachments</p><p className="m-0 text-[10.5px]" style={{ color: "var(--text-secondary)" }}>PDF, office documents, spreadsheets, text files, and images — up to 10 MB each.</p></div></div>
                      <button className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold" style={{ color: "var(--slot-1)", background: "var(--card-surface)", borderColor: "var(--slot-1)" }} type="button" onClick={() => fileInputRef.current?.click()}><Upload size={13} /> Add files</button>
                    </div>
                    <input ref={fileInputRef} className="hidden" type="file" multiple accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} aria-label="Select task attachments" />
                    {attachments.length > 0 && <ul className="mt-3 space-y-1.5 p-0" aria-label="Selected task attachments">{attachments.map((file) => <li key={`${file.name}:${file.size}:${file.lastModified}`} className="flex items-center gap-2 rounded-lg border px-2.5 py-2" style={{ background: "var(--card-surface)", borderColor: "var(--border-color)" }}><FileText size={14} style={{ color: "var(--slot-1)" }} /><span className="min-w-0 flex-1 truncate text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>{file.name}</span><span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{formatFileSize(file.size)}</span><button className="rounded p-1" style={{ color: "var(--text-muted)", background: "transparent", border: "none" }} type="button" onClick={() => setAttachments((current) => current.filter((candidate) => candidate !== file))} aria-label={`Remove ${file.name}`}><X size={13} /></button></li>)}</ul>}
                  </div>
                </div>
              </section>

              <aside className="space-y-5">
                <section className="rounded-2xl border p-4 sm:p-5" style={{ background: "var(--card-surface)", borderColor: "var(--border-color)" }}>
                  <div className="mb-4 flex items-center gap-2"><Flag size={16} style={{ color: "var(--slot-1)" }} /><h2 className="m-0 text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Priority and timing</h2></div>
                  <span className="block text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>Priority</span>
                  <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Detailed task priority">
                    {(Object.keys(priorityStyles) as ComplexTaskInput["priority"][]).map((value) => <button key={value} className="min-h-10 rounded-xl border px-2 text-[11px] font-semibold" style={{ color: priorityStyles[value].color, background: priority === value ? "var(--page-plane)" : "transparent", borderColor: priority === value ? priorityStyles[value].color : "var(--border-color)" }} type="button" aria-pressed={priority === value} onClick={() => setPriority(value)}>{priorityStyles[value].label}</button>)}
                  </div>
                  <label className="mt-4 block text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}><span className="inline-flex items-center gap-1"><CalendarDays size={13} /> Due date</span><input className="mt-1.5 h-10 w-full rounded-xl border px-3 text-[12px] font-[inherit]" style={{ background: "var(--page-plane)", color: "var(--text-primary)", borderColor: "var(--border-color)" }} type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} aria-label="Detailed task due date" /></label>
                  <label className="mt-4 block text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}><span className="inline-flex items-center gap-1"><Repeat2 size={13} /> Repeat</span><select className="mt-1.5 h-10 w-full rounded-xl border px-3 text-[12px] font-[inherit]" style={{ background: "var(--page-plane)", color: "var(--text-primary)", borderColor: "var(--border-color)" }} value={recurrence} onChange={(event) => setRecurrence(event.target.value as ComplexTaskInput["recurrence"])} aria-label="Detailed task recurrence"><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
                </section>

                <section className="rounded-2xl border p-4 sm:p-5" style={{ background: "var(--card-surface)", borderColor: "var(--border-color)" }}>
                  <div className="mb-2 flex items-center gap-2"><UserRound size={16} style={{ color: "var(--slot-1)" }} /><h2 className="m-0 text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Responsible Colleagues</h2></div>
                  <p className="m-0 text-[11px]" style={{ color: "var(--text-secondary)" }}>Choose everyone accountable for delivery. Leave unselected for N/A.</p>
                  <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Detailed task Responsible Colleagues">
                    {directReports.map((report) => {
                      const selected = responsibleColleagueIds.includes(report.id);
                      return <button key={report.id} className="min-h-9 rounded-xl border px-3 py-1.5 text-[11px] font-semibold" style={{ color: selected ? "var(--slot-1)" : "var(--text-secondary)", background: selected ? "var(--page-plane)" : "transparent", borderColor: selected ? "var(--slot-1)" : "var(--border-color)" }} type="button" aria-pressed={selected} onClick={() => setResponsibleColleagueIds((current) => selected ? current.filter((id) => id !== report.id) : [...current, report.id])}>{report.name}</button>;
                    })}
                    {directReports.length === 0 && <p className="m-0 text-[11px]" style={{ color: "var(--text-muted)" }}>No Responsible Colleagues are available yet.</p>}
                  </div>
                </section>
              </aside>
            </div>
          </main>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 sm:px-8" style={{ background: "var(--card-surface)", borderColor: "var(--border-color)" }}>
            <div className="text-[11px]" style={{ color: validationMessage ? "var(--status-critical)" : "var(--text-secondary)" }}>{validationMessage || "Files upload after the task is saved; attachments remain available in the task details."}</div>
            <div className="flex gap-2"><button className="rounded-lg border px-4 py-2 text-[12px] font-semibold" style={{ color: "var(--text-secondary)", background: "var(--page-plane)", borderColor: "var(--border-color)" }} type="button" disabled={saving} onClick={() => onOpenChange(false)}>Cancel</button><button className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-[12px] font-semibold" style={{ color: "white", background: "var(--slot-1)", borderColor: "var(--slot-1)" }} type="submit" disabled={saving}><Save size={14} /> {saving ? "Saving…" : "Create task"}</button></div>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type { ComplexTaskInput };
