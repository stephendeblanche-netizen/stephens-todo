import { useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";
import {
  canStartMobileSwipe,
  clampSwipeOffset,
  MOBILE_SWIPE_DELETE_WIDTH,
  settleSwipeOffset,
  shouldRevealSwipeDelete,
} from "@/lib/swipe";
import { useSwipeDeleteConfirmation } from "@/hooks/useSwipeDeleteConfirmation";
import { SwipeDeleteConfirmationDialog } from "@/components/SwipeDeleteConfirmationDialog";
import { Switch } from "@/components/ui/switch";
import {
  dueAtFromLocalDateInput,
  isDueToday,
  selectUpcomingTasks,
  selectTodayTasks,
  toLocalDateInputValue,
} from "@/lib/today";
import { calendarMonthDays, dateKey, filterTasksByPriority, groupTasksByDay } from "@/lib/calendar";
import { applySavedFilter, matchesDueRange, type DueRange } from "@/lib/savedFilters";
import type { Category, SavedFilter, Task } from "../../../drizzle/schema";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Flag,
  GripVertical,
  ListTodo,
  Moon,
  Plus,
  Search,
  Sun,
  Trash2,
  FileDown,
  FileUp,
  StickyNote,
  Repeat2,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

// ---- Color helpers ----
const SLOT_COLORS = [
  "var(--slot-1)", "var(--slot-2)", "var(--slot-3)", "var(--slot-4)",
  "var(--slot-5)", "var(--slot-6)", "var(--slot-7)", "var(--slot-8)",
];
function catColor(cat: Category): string {
  if (cat.kind === "urgent") return "var(--status-critical)";
  return SLOT_COLORS[cat.colorIndex % 8] ?? SLOT_COLORS[0];
}

const PRIORITY_META = {
  high: { label: "High", color: "var(--status-critical)" },
  medium: { label: "Medium", color: "var(--slot-5)" },
  low: { label: "Low", color: "var(--status-good)" },
} as const;

function priorityMeta(priority: Task["priority"]) {
  return PRIORITY_META[priority] ?? PRIORITY_META.medium;
}

const RECURRENCE_LABELS: Record<Task["recurrence"], string> = {
  none: "Does not repeat",
  daily: "Repeats daily",
  weekly: "Repeats weekly",
  monthly: "Repeats monthly",
};

// ---- Tree builder ----
type TaskNode = Task & { children: TaskNode[] };
function buildTree(tasks: Task[], parentId: number | null = null): TaskNode[] {
  return tasks
    .filter((t) => (t.parentId ?? null) === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((t) => ({ ...t, children: buildTree(tasks, t.id) }));
}
function matchesSearch(node: TaskNode, q: string): boolean {
  if (!q) return true;
  if (node.text.toLowerCase().includes(q) || node.note.toLowerCase().includes(q)) return true;
  return node.children.some((c) => matchesSearch(c, q));
}
function matchesPriority(node: TaskNode, priority: "all" | Task["priority"]): boolean {
  if (priority === "all") return true;
  if (node.priority === priority) return true;
  return node.children.some((child) => matchesPriority(child, priority));
}
function matchesDueRangeTree(node: TaskNode, dueRange: DueRange): boolean {
  if (dueRange === "all" || matchesDueRange(node.dueAt, dueRange)) return true;
  return node.children.some((child) => matchesDueRangeTree(child, dueRange));
}
function countNodes(nodes: TaskNode[]): { total: number; done: number } {
  let total = 0, done = 0;
  for (const n of nodes) {
    total++; if (n.done) done++;
    const sub = countNodes(n.children); total += sub.total; done += sub.done;
  }
  return { total, done };
}

// ---- Drag ID helpers ----
// We prefix IDs so we can tell tasks from categories in drag events
function taskDragId(id: number) { return `task-${id}`; }
function catDragId(id: number) { return `cat-${id}`; }
function parseDragId(id: string): { type: "task" | "cat"; id: number } | null {
  if (id.startsWith("task-")) return { type: "task", id: parseInt(id.slice(5)) };
  if (id.startsWith("cat-")) return { type: "cat", id: parseInt(id.slice(4)) };
  return null;
}

// ---- TaskItem ----
interface TaskItemProps {
  node: TaskNode;
  categoryId: number;
  depth: number;
  query: string;
  showCompleted: boolean;
  priorityFilter: "all" | Task["priority"];
  dueRange: DueRange;
  allCatTasks: Task[];
  onUpdate: (id: number, data: Partial<Task>) => void;
  onDelete: (id: number, text: string) => void;
  onSwipeDelete: (id: number, text: string) => void;
  onAddChild: (parentId: number, categoryId: number) => void;
  newTaskId?: number | null;
  onNewTaskCommitted?: () => void;
  isDragOverlay?: boolean;
}

function TaskItem({
  node, categoryId, depth, query, showCompleted, priorityFilter, dueRange, allCatTasks,
  onUpdate, onDelete, onSwipeDelete, onAddChild,
  newTaskId, onNewTaskCommitted,
  isDragOverlay = false,
}: TaskItemProps) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(Boolean(node.dueAt));
  const [hovered, setHovered] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeOpen, setSwipeOpen] = useState(false);
  const textInputRef = useRef<HTMLInputElement>(null);
  const swipeRef = useRef({
    tracking: false,
    horizontal: false,
    startX: 0,
    startY: 0,
    baseOffset: 0,
    currentOffset: 0,
  });
  const isNew = newTaskId === node.id;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: taskDragId(node.id),
    data: { type: "task", taskId: node.id, categoryId, parentId: node.parentId ?? null },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  useEffect(() => {
    if (isNew && textInputRef.current) {
      textInputRef.current.focus();
      textInputRef.current.select();
    }
  }, [isNew]);

  if (node.done && !showCompleted && !isDragOverlay) return null;
  if (query && !matchesSearch(node, query) && !isDragOverlay) return null;
  if (priorityFilter !== "all" && !matchesPriority(node, priorityFilter) && !isDragOverlay) return null;
  if (dueRange !== "all" && !matchesDueRangeTree(node, dueRange) && !isDragOverlay) return null;

  const hasChildren = node.children.length > 0;

  const handleSwipeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    // Keep native scrolling, inline editing, controls, and dnd-kit handles intact.
    if (!canStartMobileSwipe(event.pointerType, isDragOverlay, event.target)) return;

    swipeRef.current = {
      tracking: true,
      horizontal: false,
      startX: event.clientX,
      startY: event.clientY,
      baseOffset: swipeOpen ? -MOBILE_SWIPE_DELETE_WIDTH : 0,
      currentOffset: swipeOpen ? -MOBILE_SWIPE_DELETE_WIDTH : 0,
    };
  };

  const handleSwipeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    if (!swipe.tracking) return;

    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;

    // Leave vertical page scrolling untouched.
    if (!swipe.horizontal) {
      if (Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX)) {
        swipe.tracking = false;
        return;
      }
      if (Math.abs(deltaX) < 8) return;
      if (deltaX > 0 && swipe.baseOffset === 0) {
        swipe.tracking = false;
        return;
      }
      swipe.horizontal = true;
    }

    const offset = clampSwipeOffset(swipe.baseOffset + deltaX);
    swipe.currentOffset = offset;
    setSwipeOffset(offset);
    if (event.cancelable) event.preventDefault();
  };

  const handleSwipeEnd = () => {
    const swipe = swipeRef.current;
    if (!swipe.tracking) return;
    swipe.tracking = false;
    if (!swipe.horizontal) return;

    const finalOffset = settleSwipeOffset(swipe.currentOffset);
    setSwipeOpen(shouldRevealSwipeDelete(finalOffset));
    setSwipeOffset(finalOffset);
  };

  return (
    <>
      <li ref={setNodeRef} style={style} className="list-none">
        <div className="relative overflow-hidden rounded-md task-swipe-shell">
          <div
            className="absolute inset-y-0 right-0 flex w-24 items-stretch justify-end"
            style={{ background: "var(--status-critical)" }}
            aria-hidden={!swipeOpen}
          >
            <button
              className="w-24 border-none bg-transparent text-[12px] font-semibold text-white"
              type="button"
              tabIndex={swipeOpen ? 0 : -1}
              onClick={() => {
                setSwipeOpen(false);
                setSwipeOffset(0);
                onSwipeDelete(node.id, node.text);
              }}
            >
              <span className="flex flex-col items-center justify-center gap-1">
                <Trash2 size={15} /> Delete
              </span>
            </button>
          </div>
        <div
          className="relative z-10 flex items-start gap-1 px-1.5 py-1 rounded-md select-none transition-[transform,background-color] duration-200"
          style={{
            background: hovered ? "var(--page-plane)" : "var(--card-surface)",
            transform: `translateX(${swipeOffset}px)`,
            touchAction: "pan-y",
          }}
          onPointerDown={handleSwipeStart}
          onPointerMove={handleSwipeMove}
          onPointerUp={handleSwipeEnd}
          onPointerCancel={handleSwipeEnd}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          data-task-item
        >
          {/* Drag handle — touch-action:none so pointer events work on iOS */}
          <span
            className="mt-1 flex-shrink-0"
            style={{
              color: "var(--text-muted)",
              opacity: hovered || isDragOverlay ? 1 : 0,
              transition: "opacity 0.1s",
              touchAction: "none",
              cursor: "grab",
            }}
            data-drag-handle
            {...attributes}
            {...listeners}
          >
            <GripVertical size={12} />
          </span>

          {/* Collapse chevron or spacer */}
          {hasChildren ? (
            <button
              className="w-5 h-5 flex items-center justify-center rounded flex-shrink-0 mt-0.5 transition-transform duration-150"
              style={{ color: "var(--text-muted)", background: "transparent", border: "none", transform: node.collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
              onClick={() => onUpdate(node.id, { collapsed: !node.collapsed })}
              type="button"
            >
              <ChevronDown size={12} />
            </button>
          ) : (
            <span className="w-5 flex-shrink-0" />
          )}

          {/* Checkbox */}
          <input
            type="checkbox"
            checked={node.done}
            onChange={(e) => onUpdate(node.id, { done: e.target.checked })}
            className="mt-1 w-3.5 h-3.5 flex-shrink-0 cursor-pointer"
            style={{ accentColor: "var(--status-good)" }}
            onClick={(e) => e.stopPropagation()}
          />

          {/* Text */}
          <input
            ref={textInputRef}
            className="flex-1 min-w-0 border-none bg-transparent px-1 py-0.5 rounded text-[13.5px] leading-relaxed font-[inherit]"
            style={{
              outline: "none",
              color: node.done ? "var(--text-muted)" : "var(--text-primary)",
              textDecoration: node.done ? "line-through" : "none",
              fontWeight: hasChildren ? 600 : 400,
            }}
            defaultValue={node.text}
            onBlur={(e) => {
              const val = e.target.value.trim() || node.text;
              e.target.value = val;
              if (val !== node.text) onUpdate(node.id, { text: val });
              if (isNew && onNewTaskCommitted) onNewTaskCommitted();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
              else if (e.key === "Escape") { (e.target as HTMLInputElement).value = node.text; (e.target as HTMLInputElement).blur(); }
            }}
            onFocus={(e) => { e.target.style.background = "var(--surface-1)"; e.target.style.outline = "1px solid var(--border-color)"; }}
            onBlurCapture={(e) => { e.target.style.background = "transparent"; e.target.style.outline = "none"; }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
          <span
            className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]"
            style={{ color: priorityMeta(node.priority).color, background: "var(--page-plane)" }}
            title={`${priorityMeta(node.priority).label} priority`}
          >
            <Flag size={9} fill="currentColor" /> {priorityMeta(node.priority).label}
          </span>

          {/* Toolbar */}
          <span className="task-toolbar flex items-center gap-0.5 flex-shrink-0 transition-opacity duration-100" style={{ opacity: hovered ? 1 : 0 }}>
            <button
              className="w-5 h-5 flex items-center justify-center rounded transition-colors"
              style={{ color: priorityMeta(node.priority).color, background: "transparent", border: "none" }}
              title={`${priorityMeta(node.priority).label} priority`}
              onClick={(e) => { e.stopPropagation(); setDueOpen(true); }}
              type="button"
            >
              <Flag size={11} fill="currentColor" />
            </button>
            <button
              className="w-5 h-5 flex items-center justify-center rounded transition-colors"
              style={{ color: node.recurrence === "none" ? "var(--text-muted)" : "var(--slot-1)", background: "transparent", border: "none" }}
              title={RECURRENCE_LABELS[node.recurrence]}
              onClick={(e) => { e.stopPropagation(); setDueOpen(true); }}
              type="button"
            >
              <Repeat2 size={11} />
            </button>
            <button
              className="w-5 h-5 flex items-center justify-center rounded transition-colors"
              style={{ color: node.dueAt ? (isDueToday(node.dueAt) ? "var(--status-good)" : "var(--slot-1)") : "var(--text-muted)", background: "transparent", border: "none" }}
              title={node.dueAt ? `Due ${toLocalDateInputValue(node.dueAt)}` : "Set due date"}
              onClick={(e) => { e.stopPropagation(); setDueOpen((value) => !value); }}
              type="button"
            >
              <CalendarDays size={11} />
            </button>
            <button
              className="w-5 h-5 flex items-center justify-center rounded transition-colors"
              style={{ color: node.note ? "var(--slot-1)" : "var(--text-muted)", background: "transparent", border: "none" }}
              title={node.note ? "Edit note" : "Add note"}
              onClick={(e) => { e.stopPropagation(); setNoteOpen((v) => !v); }}
              type="button"
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--slot-1)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = node.note ? "var(--slot-1)" : "var(--text-muted)"; }}
            >
              <StickyNote size={11} />
            </button>
            <button
              className="w-5 h-5 flex items-center justify-center rounded transition-colors"
              style={{ color: "var(--text-muted)", background: "transparent", border: "none" }}
              title="Add sub-item"
              onClick={(e) => { e.stopPropagation(); onAddChild(node.id, categoryId); }}
              type="button"
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
            >
              <Plus size={11} />
            </button>
            <button
              className="w-5 h-5 flex items-center justify-center rounded transition-colors"
              style={{ color: "var(--text-muted)", background: "transparent", border: "none" }}
              title="Delete"
              onClick={(e) => { e.stopPropagation(); onDelete(node.id, node.text); }}
              type="button"
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--status-critical)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
            >
              <Trash2 size={11} />
            </button>
          </span>
        </div>
        </div>

        {/* Task schedule and priority editor */}
        {dueOpen && (
          <div className="ml-7 mb-1 mt-0.5 flex flex-wrap items-center gap-2">
            <label className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Due</label>
            <input
              type="date"
              value={toLocalDateInputValue(node.dueAt)}
              onChange={(event) => onUpdate(node.id, { dueAt: dueAtFromLocalDateInput(event.target.value) })}
              className="h-7 rounded-md border px-2 text-[11px] font-[inherit]"
              style={{ color: "var(--text-secondary)", background: "var(--page-plane)", borderColor: "var(--border-color)" }}
              aria-label={`Due date for ${node.text}`}
            />
            {node.dueAt && (
              <button
                className="border-none bg-transparent px-1 text-[11px]"
                style={{ color: "var(--text-muted)" }}
                type="button"
                onClick={() => onUpdate(node.id, { dueAt: null })}
              >
                Clear
              </button>
            )}
            <label className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Priority</label>
            <div className="flex items-center gap-1 rounded-md border p-0.5" style={{ borderColor: "var(--border-color)", background: "var(--page-plane)" }}>
              {(["high", "medium", "low"] as const).map((priority) => (
                <button
                  key={priority}
                  className="rounded px-1.5 py-1 text-[10px] font-semibold"
                  style={{
                    color: priorityMeta(priority).color,
                    background: node.priority === priority ? "var(--card-surface)" : "transparent",
                    border: "none",
                  }}
                  type="button"
                  onClick={() => onUpdate(node.id, { priority })}
                >
                  {priorityMeta(priority).label}
                </button>
              ))}
            </div>
            <label className="text-[11px]" style={{ color: "var(--text-secondary)" }}>Repeat</label>
            <select
              value={node.recurrence}
              onChange={(event) => onUpdate(node.id, { recurrence: event.target.value as Task["recurrence"] })}
              className="h-7 rounded-md border px-2 text-[11px] font-[inherit]"
              style={{ color: "var(--text-secondary)", background: "var(--page-plane)", borderColor: "var(--border-color)" }}
              aria-label={`Recurrence for ${node.text}`}
            >
              <option value="none">No repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        )}

        {/* Note box */}
        {noteOpen && (
          <div className="ml-7 mt-0.5 mb-1">
            <textarea
              id={`note-${node.id}`}
              className="w-full max-w-md text-[12.5px] border rounded-lg px-2.5 py-1.5 resize-y min-h-[40px] font-[inherit] focus:outline-none"
              style={{ color: "var(--text-secondary)", background: "var(--page-plane)", borderColor: "var(--border-color)" }}
              placeholder="Add a note…"
              defaultValue={node.note}
              onBlur={(e) => onUpdate(node.id, { note: e.target.value })}
              onClick={(e) => e.stopPropagation()}
            />
            {node.note && (
              <button
                className="mt-1 text-[11px] flex items-center gap-1 cursor-pointer font-[inherit] border-none bg-transparent px-0 py-0.5 transition-colors"
                style={{ color: "var(--text-muted)" }}
                type="button"
                title="Clear note"
                onClick={(e) => {
                  e.stopPropagation();
                  const ta = document.getElementById(`note-${node.id}`) as HTMLTextAreaElement | null;
                  if (ta) ta.value = "";
                  onUpdate(node.id, { note: "" });
                  setNoteOpen(false);
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--status-critical)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
              >
                <Trash2 size={10} /> Clear note
              </button>
            )}
          </div>
        )}

        {/* Children */}
        {hasChildren && !node.collapsed && (
          <ul className="ml-5 pl-3 mt-0.5 list-none p-0" style={{ borderLeft: "1px solid var(--gridline)" }}>
            <SortableContext
              items={node.children.map((c) => taskDragId(c.id))}
              strategy={verticalListSortingStrategy}
            >
              {node.children.map((child) => (
                <TaskItem
                  key={child.id}
                  node={child}
                  categoryId={categoryId}
                  depth={depth + 1}
                  query={query}
                  showCompleted={showCompleted}
                  priorityFilter={priorityFilter}
                  dueRange={dueRange}
                  allCatTasks={allCatTasks}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  onSwipeDelete={onSwipeDelete}
                  onAddChild={onAddChild}
                  newTaskId={newTaskId}
                  onNewTaskCommitted={onNewTaskCommitted}
                />
              ))}
            </SortableContext>
          </ul>
        )}
      </li>
    </>
  );
}

// ---- TodayTaskRow ----
interface TodayTaskRowProps {
  task: Task;
  category?: Category;
  onUpdate: (id: number, data: Partial<Task>) => void;
  onDelete: (id: number, text: string) => void;
}

function TodayTaskRow({ task, category, onUpdate, onDelete }: TodayTaskRowProps) {
  const dueToday = isDueToday(task.dueAt);
  const isUrgent = category?.kind === "urgent";

  return (
    <article
      className="flex flex-wrap items-start gap-3 rounded-xl border px-3 py-3"
      style={{ background: "var(--card-surface)", borderColor: isUrgent ? "var(--status-critical)" : "var(--border-color)" }}
    >
      <input
        type="checkbox"
        checked={task.done}
        onChange={(event) => onUpdate(task.id, { done: event.target.checked })}
        className="mt-1 h-4 w-4 flex-shrink-0 cursor-pointer"
        style={{ accentColor: "var(--status-good)" }}
        aria-label={`Mark ${task.text} complete`}
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          {category && (
            <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
              <span className="h-2 w-2 rounded-full" style={{ background: catColor(category) }} />
              {category.name}
            </span>
          )}
          {isUrgent && (
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--status-critical)", background: "var(--drop-wash)" }}>
              URGENT
            </span>
          )}
          {dueToday && (
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: "var(--status-good)", background: "var(--page-plane)" }}>
              DUE TODAY
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: priorityMeta(task.priority).color, background: "var(--page-plane)" }}>
            <Flag size={9} fill="currentColor" /> {priorityMeta(task.priority).label}
          </span>
          {task.recurrence !== "none" && (
            <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]" style={{ color: "var(--slot-1)", background: "var(--page-plane)" }}>
              <Repeat2 size={9} /> {task.recurrence}
            </span>
          )}
        </div>
        <input
          className="w-full border-none bg-transparent px-0 py-0.5 text-[14px] font-[inherit]"
          style={{ color: "var(--text-primary)", outline: "none" }}
          defaultValue={task.text}
          onBlur={(event) => {
            const text = event.target.value.trim() || task.text;
            event.target.value = text;
            if (text !== task.text) onUpdate(task.id, { text });
          }}
          aria-label="Task title"
        />
      </div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
        <input
          type="date"
          value={toLocalDateInputValue(task.dueAt)}
          onChange={(event) => onUpdate(task.id, { dueAt: dueAtFromLocalDateInput(event.target.value) })}
          className="h-7 max-w-[130px] rounded-md border px-1.5 text-[11px] font-[inherit]"
          style={{ color: "var(--text-secondary)", background: "var(--page-plane)", borderColor: "var(--border-color)" }}
          aria-label={`Due date for ${task.text}`}
        />
        <select
          value={task.priority}
          onChange={(event) => onUpdate(task.id, { priority: event.target.value as Task["priority"] })}
          className="h-7 rounded-md border px-1.5 text-[11px] font-[inherit]"
          style={{ color: priorityMeta(task.priority).color, background: "var(--page-plane)", borderColor: "var(--border-color)" }}
          aria-label={`Priority for ${task.text}`}
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={task.recurrence}
          onChange={(event) => onUpdate(task.id, { recurrence: event.target.value as Task["recurrence"] })}
          className="h-7 rounded-md border px-1.5 text-[11px] font-[inherit]"
          style={{ color: "var(--text-secondary)", background: "var(--page-plane)", borderColor: "var(--border-color)" }}
          aria-label={`Recurrence for ${task.text}`}
        >
          <option value="none">No repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <button
          className="flex h-7 w-7 items-center justify-center rounded border-none bg-transparent"
          style={{ color: "var(--text-muted)" }}
          type="button"
          title="Delete task"
          onClick={() => onDelete(task.id, task.text)}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </article>
  );
}

// ---- CategoryCard ----
interface CategoryCardProps {
  cat: Category;
  tasks: Task[];
  query: string;
  showCompleted: boolean;
  priorityFilter: "all" | Task["priority"];
  dueRange: DueRange;
  onUpdateCat: (id: number, data: Partial<Category>) => void;
  onDeleteCat: (id: number, name: string) => void;
  onUpdateTask: (id: number, data: Partial<Task>) => void;
  onDeleteTask: (id: number, text: string) => void;
  onSwipeDelete: (id: number, text: string) => void;
  onAddTask: (catId: number, parentId?: number) => void;
  onClearCompleted: (catId: number) => void;
  newTaskId?: number | null;
  onNewTaskCommitted?: () => void;
}

function CategoryCard({
  cat, tasks, query, showCompleted, priorityFilter, dueRange,
  onUpdateCat, onDeleteCat, onUpdateTask, onDeleteTask, onSwipeDelete, onAddTask, onClearCompleted,
  newTaskId, onNewTaskCommitted,
}: CategoryCardProps) {
  const tree = useMemo(() => buildTree(tasks), [tasks]);
  const { total, done } = useMemo(() => countNodes(tree), [tree]);
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;
  const color = catColor(cat);

  const {
    attributes: catAttributes,
    listeners: catListeners,
    setNodeRef: setCatRef,
    transform: catTransform,
    transition: catTransition,
    isDragging: isCatDragging,
  } = useSortable({
    id: catDragId(cat.id),
    data: { type: "cat", catId: cat.id },
  });

  const catStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(catTransform),
    transition: catTransition,
    opacity: isCatDragging ? 0.4 : 1,
  };

  // Top-level tasks for this category (for sortable context) — must be before early return
  const topLevelTasks = useMemo(
    () => tasks.filter((t) => (t.parentId ?? null) === null).sort((a, b) => a.sortOrder - b.sortOrder),
    [tasks]
  );
  const hasMatchingItems = !query || tasks.some((t) => t.text.toLowerCase().includes(query) || t.note.toLowerCase().includes(query));
  const hasMatchingPriority = priorityFilter === "all" || tasks.some((task) => task.priority === priorityFilter);
  const hasMatchingDueRange = dueRange === "all" || tasks.some((task) => matchesDueRange(task.dueAt, dueRange));
  if ((query && !hasMatchingItems) || !hasMatchingPriority || !hasMatchingDueRange) return null;

  return (
    <div
      ref={setCatRef}
      style={{
        ...catStyle,
        background: "var(--card-surface)",
        border: cat.kind === "urgent" ? "1.5px solid var(--status-critical)" : "1px solid var(--border-color)",
      }}
      className="rounded-2xl mb-3.5 overflow-hidden transition-colors duration-100"
      data-cat-id={cat.id}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2.5 px-4 py-3 select-none">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Category drag handle — touch-action:none for iOS */}
          <span
            className="flex-shrink-0"
            style={{
              color: "var(--text-muted)",
              opacity: 0.4,
              transition: "opacity 0.1s",
              touchAction: "none",
              cursor: "grab",
            }}
            title="Drag to reorder category"
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.4"; }}
            {...catAttributes}
            {...catListeners}
          >
            <GripVertical size={14} />
          </span>
          <button
            className="w-5 h-5 flex items-center justify-center rounded flex-shrink-0 transition-transform duration-150"
            style={{ color: "var(--text-muted)", background: "transparent", border: "none", transform: cat.collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
            onClick={() => onUpdateCat(cat.id, { collapsed: !cat.collapsed })}
            type="button"
          >
            <ChevronDown size={14} />
          </button>
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
          <input
            className="font-semibold text-[14.5px] bg-transparent border-none px-1 py-0.5 rounded min-w-0 font-[inherit]"
            style={{ color: "var(--text-primary)", outline: "none" }}
            defaultValue={cat.name}
            onBlur={(e) => { if (e.target.value !== cat.name) onUpdateCat(cat.id, { name: e.target.value }); }}
            onFocus={(e) => { e.target.style.background = "var(--page-plane)"; e.target.style.outline = "1px solid var(--border-color)"; }}
            onBlurCapture={(e) => { e.target.style.background = "transparent"; e.target.style.outline = "none"; }}
            onClick={(e) => e.stopPropagation()}
          />
          <span
            className="text-[11px] px-2 py-0.5 rounded-full border flex-shrink-0"
            style={{
              color: cat.kind === "urgent" ? "var(--status-critical)" : "var(--text-secondary)",
              borderColor: cat.kind === "urgent" ? "var(--status-critical)" : "var(--border-color)",
              background: cat.kind === "urgent" ? "transparent" : "var(--page-plane)",
            }}
          >
            {total} item{total !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--gridline)" }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%`, background: "var(--status-good)" }} />
          </div>
          <button
            className="w-5 h-5 flex items-center justify-center rounded transition-colors"
            style={{ color: "var(--text-muted)", background: "transparent", border: "none" }}
            title="Delete category"
            onClick={() => onDeleteCat(cat.id, cat.name)}
            type="button"
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--status-critical)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Body */}
      {!cat.collapsed && (
        <div className="px-4 pb-3.5">
          <ul className="list-none m-0 p-0 min-h-[6px]">
            <SortableContext
              items={topLevelTasks.map((t) => taskDragId(t.id))}
              strategy={verticalListSortingStrategy}
            >
              {tree.map((node) => (
                <TaskItem
                  key={node.id}
                  node={node}
                  categoryId={cat.id}
                  depth={0}
                  query={query}
                  showCompleted={showCompleted}
                  priorityFilter={priorityFilter}
                  dueRange={dueRange}
                  allCatTasks={tasks}
                  onUpdate={onUpdateTask}
                  onDelete={onDeleteTask}
                  onSwipeDelete={onSwipeDelete}
                  onAddChild={(parentId, catId) => onAddTask(catId, parentId)}
                  newTaskId={newTaskId}
                  onNewTaskCommitted={onNewTaskCommitted}
                />
              ))}
            </SortableContext>
          </ul>
          {!query && (
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <button
                className="text-[12px] bg-transparent border-none cursor-pointer font-[inherit] px-1.5 py-1 transition-colors"
                style={{ color: "var(--text-muted)" }}
                onClick={() => onAddTask(cat.id)}
                type="button"
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; (e.currentTarget as HTMLButtonElement).style.textDecoration = "underline"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLButtonElement).style.textDecoration = "none"; }}
              >
                + Add item
              </button>
              {tasks.some((t) => t.done) && (
                <button
                  className="text-[12px] bg-transparent border-none cursor-pointer font-[inherit] px-1.5 py-1 transition-colors flex items-center gap-1"
                  style={{ color: "var(--text-muted)" }}
                  onClick={() => onClearCompleted(cat.id)}
                  type="button"
                  title="Remove all completed items from this category"
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--status-critical)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
                >
                  <Trash2 size={11} /> Clear completed
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Main Dashboard ----
export default function Dashboard() {
  const { theme, toggleTheme } = useTheme();
  const utils = trpc.useUtils();

  const { data: categoriesData = [], isLoading: catsLoading } = trpc.categories.list.useQuery();
  const { data: tasksData = [], isLoading: tasksLoading } = trpc.tasks.listAll.useQuery();
  const { data: savedFilters = [] } = trpc.filters.list.useQuery();

  const [query, setQuery] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [activeCats, setActiveCats] = useState<Set<number> | null>(null);
  const [activeView, setActiveView] = useState<"all" | "today" | "upcoming" | "high" | "calendar">(() => {
    if (typeof window === "undefined") return "all";
    const view = new URLSearchParams(window.location.search).get("view");
    return view === "today" || view === "upcoming" || view === "high" || view === "calendar" ? view : "all";
  });
  const [priorityFilter, setPriorityFilter] = useState<"all" | Task["priority"]>("all");
  const [dueRange, setDueRange] = useState<DueRange>("all");
  const [filterName, setFilterName] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState<number | null>(null);
  const [editingFilterId, setEditingFilterId] = useState<number | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => dateKey(new Date()));
  const [newCatName, setNewCatName] = useState("");
  const [newTaskId, setNewTaskId] = useState<number | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const createCatMut = trpc.categories.create.useMutation({ onSuccess: () => utils.categories.list.invalidate() });
  const updateCatMut = trpc.categories.update.useMutation({ onSuccess: () => utils.categories.list.invalidate() });
  const deleteCatMut = trpc.categories.delete.useMutation({
    onSuccess: () => { utils.categories.list.invalidate(); utils.tasks.listAll.invalidate(); },
  });
  const createCatRestoreMut = trpc.categories.create.useMutation({
    onSuccess: () => { utils.categories.list.invalidate(); utils.tasks.listAll.invalidate(); },
  });
  const createTaskMut = trpc.tasks.create.useMutation({ onSuccess: () => utils.tasks.listAll.invalidate() });
  const updateTaskMut = trpc.tasks.update.useMutation({ onSuccess: () => utils.tasks.listAll.invalidate() });
  const deleteTaskMut = trpc.tasks.delete.useMutation({ onSuccess: () => utils.tasks.listAll.invalidate() });
  const clearCompletedMut = trpc.tasks.clearCompleted.useMutation({ onSuccess: () => utils.tasks.listAll.invalidate() });
  const reorderTaskMut = trpc.tasks.reorder.useMutation({ onSuccess: () => utils.tasks.listAll.invalidate() });
  const reorderCatMut = trpc.categories.reorder.useMutation({ onSuccess: () => utils.categories.list.invalidate() });
  const createSavedFilterMut = trpc.filters.create.useMutation({ onSuccess: () => utils.filters.list.invalidate() });
  const updateSavedFilterMut = trpc.filters.update.useMutation({ onSuccess: () => utils.filters.list.invalidate() });
  const deleteSavedFilterMut = trpc.filters.delete.useMutation({ onSuccess: () => utils.filters.list.invalidate() });
  const exportQuery = trpc.data.export.useQuery(undefined, { enabled: false });
  const importMut = trpc.data.import.useMutation({
    onSuccess: () => { utils.categories.list.invalidate(); utils.tasks.listAll.invalidate(); utils.filters.list.invalidate(); toast.success("Snapshot imported successfully"); },
    onError: () => toast.error("Could not import — is this a valid dashboard export?"),
  });

  const effectiveActiveCats = useMemo(() => {
    if (activeCats !== null) return activeCats;
    return new Set(categoriesData.map((c) => c.id));
  }, [activeCats, categoriesData]);

  const stats = useMemo(() => {
    const urgentCat = categoriesData.find((c) => c.kind === "urgent");
    const urgentTasks = urgentCat ? tasksData.filter((t) => t.categoryId === urgentCat.id && !t.done) : [];
    const total = tasksData.length;
    const done = tasksData.filter((t) => t.done).length;
    return { total, done, urgent: urgentTasks.length, categories: categoriesData.length };
  }, [categoriesData, tasksData]);

  const todayTasks = useMemo(
    () => selectTodayTasks(tasksData, categoriesData),
    [tasksData, categoriesData],
  );
  const upcomingTasks = useMemo(
    () => selectUpcomingTasks(tasksData, categoriesData),
    [tasksData, categoriesData],
  );
  const priorityFilteredTasks = useMemo(
    () => filterTasksByPriority(tasksData, priorityFilter),
    [tasksData, priorityFilter],
  );
  const priorityFilteredTodayTasks = useMemo(
    () => filterTasksByPriority(todayTasks, priorityFilter),
    [todayTasks, priorityFilter],
  );
  const priorityFilteredUpcomingTasks = useMemo(
    () => filterTasksByPriority(upcomingTasks, priorityFilter),
    [upcomingTasks, priorityFilter],
  );
  const activeSavedCriteria = useMemo(() => ({
    priority: priorityFilter,
    dueRange,
    categoryId: filterCategoryId,
    includeCompleted: showCompleted,
  }), [priorityFilter, dueRange, filterCategoryId, showCompleted]);
  const savedFilteredTodayTasks = useMemo(
    () => applySavedFilter(todayTasks, activeSavedCriteria),
    [todayTasks, activeSavedCriteria],
  );
  const savedFilteredUpcomingTasks = useMemo(
    () => applySavedFilter(upcomingTasks, activeSavedCriteria),
    [upcomingTasks, activeSavedCriteria],
  );
  const highPriorityTasks = useMemo(
    () => tasksData.filter((task) => !task.done && task.priority === "high"),
    [tasksData],
  );
  const calendarDays = useMemo(() => calendarMonthDays(calendarMonth), [calendarMonth]);
  const calendarTaskGroups = useMemo(
    () => groupTasksByDay(applySavedFilter(tasksData, activeSavedCriteria)),
    [tasksData, activeSavedCriteria],
  );
  const selectedCalendarTasks = calendarTaskGroups.get(selectedCalendarDate) ?? [];

  // ---- Handlers ----
  const handleUpdateCat = useCallback((id: number, data: Partial<Category>) => {
    updateCatMut.mutate({ id, ...data });
  }, [updateCatMut]);

  const handleDeleteCat = useCallback((id: number, name: string) => {
    const cat = categoriesData.find((c) => c.id === id);
    const catTasks = tasksData.filter((t) => t.categoryId === id);
    deleteCatMut.mutate({ id });
    toast(`Removed category "${name}"`, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          if (!cat) return;
          createCatRestoreMut.mutate({ name: cat.name, kind: cat.kind, colorIndex: cat.colorIndex, sortOrder: cat.sortOrder });
          toast.info(`Category "${name}" restored. You may need to re-add its ${catTasks.length} tasks.`);
        },
      },
    });
  }, [deleteCatMut, createCatRestoreMut, categoriesData, tasksData]);

  const handleUpdateTask = useCallback((id: number, data: Partial<Task>) => {
    updateTaskMut.mutate({ id, ...data });
  }, [updateTaskMut]);

  const handleDeleteTask = useCallback((id: number, text: string) => {
    const task = tasksData.find((t) => t.id === id);
    deleteTaskMut.mutate({ id });
    toast(`Removed "${text}"`, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          if (!task) return;
          createTaskMut.mutate({ categoryId: task.categoryId, parentId: task.parentId ?? undefined, text: task.text, sortOrder: task.sortOrder, dueAt: task.dueAt ?? null, priority: task.priority, recurrence: task.recurrence });
          toast.success(`"${text}" restored.`);
        },
      },
    });
  }, [deleteTaskMut, createTaskMut, tasksData]);

  const {
    confirmSwipeDelete,
    pendingSwipeDelete,
    setConfirmSwipeDelete,
    requestSwipeDelete,
    confirmPendingSwipeDelete,
    clearPendingSwipeDelete,
  } = useSwipeDeleteConfirmation(handleDeleteTask);

  const handleClearCompleted = useCallback((catId: number) => {
    const doneTasks = tasksData.filter((t) => t.categoryId === catId && t.done);
    if (doneTasks.length === 0) return;
    clearCompletedMut.mutate({ categoryId: catId });
    toast(`Removed ${doneTasks.length} completed item${doneTasks.length !== 1 ? "s" : ""} from this category`, {
      duration: 6000,
      action: {
        label: "Undo",
        onClick: () => {
          for (const t of doneTasks) {
            createTaskMut.mutate({ categoryId: t.categoryId, parentId: t.parentId ?? undefined, text: t.text, sortOrder: t.sortOrder, dueAt: t.dueAt ?? null, priority: t.priority, recurrence: t.recurrence });
          }
          toast.success(`${doneTasks.length} item${doneTasks.length !== 1 ? "s" : ""} restored.`);
        },
      },
    });
  }, [clearCompletedMut, createTaskMut, tasksData]);

  const handleAddTask = useCallback((catId: number, parentId?: number) => {
    const siblings = tasksData.filter((t) => t.categoryId === catId && (t.parentId ?? null) === (parentId ?? null));
    createTaskMut.mutate(
      { categoryId: catId, parentId, text: "New item", sortOrder: siblings.length },
      {
        onSuccess: (data) => {
          utils.tasks.listAll.invalidate().then(() => {
            setNewTaskId(data.id);
          });
        },
      }
    );
  }, [createTaskMut, tasksData, utils]);

  const handleAddCategory = useCallback(() => {
    const name = newCatName.trim();
    if (!name) return;
    const usedColors = new Set(categoriesData.map((c) => c.colorIndex));
    let colorIndex = 0;
    while (usedColors.has(colorIndex) && colorIndex < 7) colorIndex++;
    createCatMut.mutate({ name, kind: "normal", colorIndex, sortOrder: categoriesData.length });
    setNewCatName("");
  }, [newCatName, categoriesData, createCatMut]);

  const handleSaveFilter = useCallback(() => {
    const name = filterName.trim();
    if (!name) {
      toast.error("Name this filter before saving it.");
      return;
    }
    const filterData = {
      name,
      priority: priorityFilter,
      dueRange,
      categoryId: filterCategoryId,
      includeCompleted: showCompleted,
      sortOrder: editingFilterId === null ? savedFilters.length : (savedFilters.find((filter) => filter.id === editingFilterId)?.sortOrder ?? 0),
    };
    const onSuccess = () => {
      setFilterName("");
      setEditingFilterId(null);
      toast.success(editingFilterId === null ? `Saved “${name}”` : `Updated “${name}”`);
    };
    if (editingFilterId !== null) {
      updateSavedFilterMut.mutate({ id: editingFilterId, ...filterData }, { onSuccess });
      return;
    }
    createSavedFilterMut.mutate(filterData, {
      onSuccess,
    });
  }, [filterName, createSavedFilterMut, updateSavedFilterMut, priorityFilter, dueRange, filterCategoryId, showCompleted, savedFilters, editingFilterId]);

  const handleApplySavedFilter = useCallback((filter: SavedFilter) => {
    setPriorityFilter(filter.priority);
    setDueRange(filter.dueRange);
    setFilterCategoryId(filter.categoryId ?? null);
    setActiveCats(filter.categoryId ? new Set([filter.categoryId]) : null);
    setShowCompleted(filter.includeCompleted);
    setActiveView("all");
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    window.history.replaceState({}, "", url);
    toast.success(`Applied “${filter.name}”`);
  }, []);

  const handleDeleteSavedFilter = useCallback((filter: SavedFilter) => {
    deleteSavedFilterMut.mutate({ id: filter.id });
    if (editingFilterId === filter.id) {
      setEditingFilterId(null);
      setFilterName("");
    }
    toast(`Deleted saved filter “${filter.name}”`);
  }, [deleteSavedFilterMut, editingFilterId]);

  const handleEditSavedFilter = useCallback((filter: SavedFilter) => {
    setEditingFilterId(filter.id);
    setFilterName(filter.name);
    setPriorityFilter(filter.priority);
    setDueRange(filter.dueRange);
    setFilterCategoryId(filter.categoryId ?? null);
    setShowCompleted(filter.includeCompleted);
  }, []);

  // ---- Export / Import ----
  const handleExport = useCallback(async () => {
    const result = await exportQuery.refetch();
    if (!result.data) return;
    const payload = JSON.stringify(result.data, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `stephen-todo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  }, [exportQuery]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!parsed.categories) throw new Error("Missing categories");
        const cats = (parsed.categories as Category[]).map((c, i) => ({
          name: c.name, kind: c.kind, colorIndex: c.colorIndex ?? i % 8, sortOrder: c.sortOrder ?? i, collapsed: c.collapsed ?? false,
        }));
        const flatTasks: Array<{ tempId: string; categoryIndex: number; parentTempId: string | null; text: string; note: string; dueAt: number | null; priority: Task["priority"]; recurrence: Task["recurrence"]; done: boolean; collapsed: boolean; sortOrder: number }> = [];
        if (parsed.tasks && Array.isArray(parsed.tasks)) {
          (parsed.tasks as Task[]).forEach((t, i) => {
            const catIdxReal = parsed.categories.findIndex((c: Category) => c.id === t.categoryId);
            flatTasks.push({
              tempId: `t${i}`, categoryIndex: catIdxReal >= 0 ? catIdxReal : 0,
              parentTempId: t.parentId ? `t${parsed.tasks.findIndex((pt: Task) => pt.id === t.parentId)}` : null,
              text: t.text, note: t.note ?? "", dueAt: t.dueAt ?? null, priority: t.priority ?? "medium", recurrence: t.recurrence ?? "none", done: t.done ?? false, collapsed: t.collapsed ?? false, sortOrder: t.sortOrder ?? i,
            });
          });
        }
        const importedFilters = Array.isArray(parsed.filters)
          ? (parsed.filters as SavedFilter[]).map((filter) => ({
              name: filter.name,
              priority: filter.priority,
              dueRange: filter.dueRange,
              categoryIndex: filter.categoryId === null ? null : parsed.categories.findIndex((category: Category) => category.id === filter.categoryId),
              includeCompleted: filter.includeCompleted,
              sortOrder: filter.sortOrder,
            })).map((filter) => ({ ...filter, categoryIndex: filter.categoryIndex < 0 ? null : filter.categoryIndex }))
          : undefined;
        importMut.mutate({ categories: cats, tasks: flatTasks, ...(importedFilters ? { filters: importedFilters } : {}) });
      } catch { toast.error("Could not read that file — is it a dashboard export?"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, [importMut]);

  const toggleCat = useCallback((catId: number) => {
    setActiveCats((prev) => {
      const base = prev ?? new Set(categoriesData.map((c) => c.id));
      const next = new Set(base);
      if (next.has(catId)) next.delete(catId); else next.add(catId);
      return next;
    });
  }, [categoriesData]);

  const handleViewChange = useCallback((view: "all" | "today" | "upcoming" | "high" | "calendar") => {
    setActiveView(view);
    const url = new URL(window.location.href);
    if (view !== "all") url.searchParams.set("view", view);
    else url.searchParams.delete("view");
    window.history.replaceState({}, "", url);
  }, []);

  const handleCalendarMonthChange = useCallback((delta: number) => {
    const nextMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + delta, 1);
    setCalendarMonth(nextMonth);
    setSelectedCalendarDate(dateKey(nextMonth));
  }, [calendarMonth]);

  // ---- dnd-kit sensors — pointer + touch, with 8px activation distance ----
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeInfo = parseDragId(String(active.id));
    const overInfo = parseDragId(String(over.id));
    if (!activeInfo || !overInfo) return;

    // ---- Category reorder ----
    // Always work against the FULL sorted category list so hidden (filtered) categories
    // keep their correct global sortOrder.
    if (activeInfo.type === "cat" && overInfo.type === "cat") {
      const allSorted = [...categoriesData].sort((a, b) => a.sortOrder - b.sortOrder);
      const oldIdx = allSorted.findIndex((c) => c.id === activeInfo.id);
      const newIdx = allSorted.findIndex((c) => c.id === overInfo.id);
      if (oldIdx === -1 || newIdx === -1) return;
      const reordered = arrayMove(allSorted, oldIdx, newIdx);
      const updates = reordered.map((c, i) => ({ id: c.id, sortOrder: i }));
      reorderCatMut.mutate(updates);
      return;
    }

    // ---- Task reorder ----
    // Always work against the FULL sibling list at the destination level (not just visible
    // ones) so hidden completed/searched-out siblings keep their correct sortOrder.
    if (activeInfo.type === "task" && overInfo.type === "task") {
      const activeTask = tasksData.find((t) => t.id === activeInfo.id);
      const overTask = tasksData.find((t) => t.id === overInfo.id);
      if (!activeTask || !overTask) return;

      const targetCatId = overTask.categoryId;
      const targetParentId = overTask.parentId ?? null;

      // Full sibling list at destination (all tasks, not just visible ones)
      const allSiblings = tasksData
        .filter((t) => t.categoryId === targetCatId && (t.parentId ?? null) === targetParentId && t.id !== activeTask.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      // Insert active task at the position of the over task
      const overIdx = allSiblings.findIndex((t) => t.id === overTask.id);
      const insertIdx = overIdx === -1 ? allSiblings.length : overIdx;
      allSiblings.splice(insertIdx, 0, { ...activeTask, categoryId: targetCatId, parentId: targetParentId });

      const updates = allSiblings.map((t, i) => ({
        id: t.id,
        sortOrder: i,
        parentId: targetParentId,
        categoryId: targetCatId,
      }));
      reorderTaskMut.mutate(updates);
    }
  }, [categoriesData, tasksData, reorderCatMut, reorderTaskMut]);

  // Find the active dragging item for the overlay
  const activeDragTask = activeDragId
    ? tasksData.find((t) => taskDragId(t.id) === activeDragId)
    : null;
  const activeDragCat = activeDragId
    ? categoriesData.find((c) => catDragId(c.id) === activeDragId)
    : null;

  const isLoading = catsLoading || tasksLoading;
  const sortedCats = useMemo(
    () => [...categoriesData].sort((a, b) => a.sortOrder - b.sortOrder),
    [categoriesData]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="min-h-screen" style={{ background: "var(--page-plane)", color: "var(--text-primary)" }}>
        <div className="max-w-[1000px] mx-auto px-5 py-6 pb-24">

          {/* Top bar */}
          <div className="flex justify-between items-start gap-4 flex-wrap mb-5">
            <div>
              <h1 className="text-[22px] font-bold m-0 mb-1" style={{ color: "var(--text-primary)" }}>
                Stephen's To-Do Dashboard
              </h1>
              <p className="text-[13px] m-0" style={{ color: "var(--text-secondary)" }}>
                {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] cursor-pointer font-[inherit] transition-colors"
                style={{ background: "var(--card-surface)", color: "var(--text-primary)", borderColor: "var(--border-color)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--text-secondary)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-color)"; }}
                onClick={handleExport} type="button"
              >
                <FileDown size={13} /> Export snapshot
              </button>
              <label
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] cursor-pointer font-[inherit] transition-colors"
                style={{ background: "var(--card-surface)", color: "var(--text-primary)", borderColor: "var(--border-color)" }}
              >
                <FileUp size={13} /> Import snapshot
                <input type="file" accept="application/json" className="hidden" onChange={handleImport} />
              </label>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] cursor-pointer font-[inherit] transition-colors"
                style={{ background: "var(--card-surface)", color: "var(--text-secondary)", borderColor: "var(--border-color)" }}
                onClick={toggleTheme} type="button"
              >
                {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid gap-3 mb-5 stats-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            {[
              { label: "Total items", value: stats.total, urgent: false },
              { label: "Urgent", value: stats.urgent, urgent: true },
              { label: "Categories", value: stats.categories, urgent: false },
              { label: "Completed", value: stats.done, urgent: false },
            ].map(({ label, value, urgent }) => (
              <div key={label} className="rounded-xl border px-4 py-3.5" style={{ background: "var(--card-surface)", borderColor: "var(--border-color)" }}>
                <div className="text-[26px] font-bold leading-none" style={{ color: urgent ? "var(--status-critical)" : "var(--text-primary)" }}>{value}</div>
                <div className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>{label}</div>
              </div>
            ))}
          </div>

          <nav className="mb-4 flex flex-wrap items-center gap-1 rounded-xl border p-1" style={{ background: "var(--card-surface)", borderColor: "var(--border-color)" }} aria-label="Task views">
            <button
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-[inherit] transition-colors"
              style={{ background: activeView === "all" ? "var(--page-plane)" : "transparent", color: activeView === "all" ? "var(--text-primary)" : "var(--text-secondary)", border: "none" }}
              onClick={() => handleViewChange("all")}
              type="button"
            >
              <ListTodo size={13} /> All tasks
            </button>
            <button
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-[inherit] transition-colors"
              style={{ background: activeView === "today" ? "var(--page-plane)" : "transparent", color: activeView === "today" ? "var(--text-primary)" : "var(--text-secondary)", border: "none" }}
              onClick={() => handleViewChange("today")}
              type="button"
            >
              <CalendarDays size={13} /> Today <span className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: "var(--drop-wash)", color: "var(--text-secondary)" }}>{todayTasks.length}</span>
            </button>
            <button
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-[inherit] transition-colors"
              style={{ background: activeView === "upcoming" ? "var(--page-plane)" : "transparent", color: activeView === "upcoming" ? "var(--text-primary)" : "var(--text-secondary)", border: "none" }}
              onClick={() => handleViewChange("upcoming")}
              type="button"
            >
              <CalendarDays size={13} /> Upcoming <span className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: "var(--drop-wash)", color: "var(--text-secondary)" }}>{upcomingTasks.length}</span>
            </button>
            <button
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-[inherit] transition-colors"
              style={{ background: activeView === "high" ? "var(--page-plane)" : "transparent", color: activeView === "high" ? "var(--text-primary)" : "var(--text-secondary)", border: "none" }}
              onClick={() => handleViewChange("high")}
              type="button"
            >
              <Flag size={13} fill="currentColor" style={{ color: "var(--status-critical)" }} /> High <span className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: "var(--drop-wash)", color: "var(--text-secondary)" }}>{highPriorityTasks.length}</span>
            </button>
            <button
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-[inherit] transition-colors"
              style={{ background: activeView === "calendar" ? "var(--page-plane)" : "transparent", color: activeView === "calendar" ? "var(--text-primary)" : "var(--text-secondary)", border: "none" }}
              onClick={() => handleViewChange("calendar")}
              type="button"
            >
              <CalendarDays size={13} /> Calendar
            </button>
          </nav>

          {/* Controls */}
          <div className="flex gap-2.5 flex-wrap mb-3.5 items-center">
            <div className="flex-1 min-w-[200px] relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }} />
              <input
                className="w-full pl-8 pr-3 py-2 rounded-lg border text-[13px] font-[inherit]"
                style={{ background: "var(--card-surface)", color: "var(--text-primary)", borderColor: "var(--border-color)", outline: "none" }}
                placeholder="Search to-do items…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={(e) => { e.target.style.outline = "1px solid var(--slot-1)"; }}
                onBlur={(e) => { e.target.style.outline = "none"; }}
              />
            </div>
            <button
              className="px-3 py-2 rounded-full border text-[12px] cursor-pointer font-[inherit] transition-colors"
              style={{ background: "var(--card-surface)", color: showCompleted ? "var(--text-primary)" : "var(--text-secondary)", borderColor: showCompleted ? "var(--text-primary)" : "var(--border-color)" }}
              onClick={() => setShowCompleted((v) => !v)} type="button"
            >
              {showCompleted ? "Hide completed" : "Show completed"}
            </button>
            <div className="flex items-center gap-1 rounded-full border p-1" style={{ background: "var(--card-surface)", borderColor: "var(--border-color)" }} aria-label="Priority filter">
              {(["all", "high", "medium", "low"] as const).map((priority) => {
                const isActive = priorityFilter === priority;
                const meta = priority === "all" ? { label: "All", color: "var(--text-secondary)" } : priorityMeta(priority);
                return (
                  <button
                    key={priority}
                    className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-[inherit]"
                    style={{ color: meta.color, background: isActive ? "var(--page-plane)" : "transparent", border: "none" }}
                    onClick={() => setPriorityFilter(priority)}
                    type="button"
                    aria-label={`Filter ${meta.label} priority`}
                  >
                    {priority !== "all" && <Flag size={10} fill="currentColor" />} {meta.label}
                  </button>
                );
              })}
            </div>
            <select
              className="h-9 rounded-full border px-3 text-[12px] font-[inherit]"
              style={{ background: "var(--card-surface)", color: "var(--text-secondary)", borderColor: "var(--border-color)" }}
              value={dueRange}
              onChange={(event) => setDueRange(event.target.value as DueRange)}
              aria-label="Due date range filter"
            >
              <option value="all">Any due date</option>
              <option value="today">Due today</option>
              <option value="this_week">Due this week</option>
              <option value="next_7_days">Due next 7 days</option>
              <option value="overdue">Overdue</option>
              <option value="no_due_date">No due date</option>
            </select>
            <label
              className="flex items-center gap-2 px-3 py-2 rounded-full border text-[12px] cursor-pointer font-[inherit]"
              style={{ background: "var(--card-surface)", color: "var(--text-secondary)", borderColor: "var(--border-color)" }}
              title="Ask for confirmation before deleting a task with the swipe action"
            >
              <ShieldCheck size={13} style={{ color: confirmSwipeDelete ? "var(--status-good)" : "var(--text-muted)" }} />
              Confirm swipe delete
              <Switch
                checked={confirmSwipeDelete}
                onCheckedChange={setConfirmSwipeDelete}
                aria-label="Confirm swipe deletion"
              />
            </label>
          </div>

          <section className="mb-4 rounded-xl border p-3" style={{ background: "var(--card-surface)", borderColor: "var(--border-color)" }}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="m-0 text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Saved filters</h2>
                <p className="m-0 mt-0.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>Save the current priority, due-date, category, and completion combination.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                className="min-w-[180px] flex-1 rounded-lg border px-3 py-2 text-[12px] font-[inherit]"
                style={{ background: "var(--page-plane)", color: "var(--text-primary)", borderColor: "var(--border-color)", outline: "none" }}
                value={filterName}
                onChange={(event) => setFilterName(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") handleSaveFilter(); }}
                placeholder={editingFilterId === null ? "Name this filter…" : "Edit saved filter name…"}
                aria-label="Saved filter name"
              />
              <select
                className="rounded-lg border px-2 py-2 text-[12px] font-[inherit]"
                style={{ background: "var(--page-plane)", color: "var(--text-secondary)", borderColor: "var(--border-color)" }}
                value={filterCategoryId ?? "all"}
                onChange={(event) => setFilterCategoryId(event.target.value === "all" ? null : Number(event.target.value))}
                aria-label="Saved filter category"
              >
                <option value="all">All categories</option>
                {categoriesData.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <button className="rounded-lg border px-3 py-2 text-[12px] font-[inherit]" style={{ color: "var(--text-primary)", background: "var(--page-plane)", borderColor: "var(--border-color)" }} type="button" onClick={handleSaveFilter}>
                {editingFilterId === null ? "Save filter" : "Update filter"}
              </button>
            </div>
            {savedFilters.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {savedFilters.map((filter) => (
                  <div key={filter.id} className="flex items-center gap-1 rounded-full border pl-3 pr-1 py-1" style={{ borderColor: "var(--border-color)", color: "var(--text-secondary)", background: "var(--page-plane)" }}>
                    <button className="border-none bg-transparent px-0.5 text-[11px] font-[inherit]" style={{ color: "var(--text-primary)" }} type="button" onClick={() => handleApplySavedFilter(filter)}>
                      {filter.name}
                    </button>
                    <button className="rounded-full border-none bg-transparent px-1 text-[10px] font-[inherit]" style={{ color: "var(--slot-1)" }} type="button" title={`Edit ${filter.name}`} aria-label={`Edit ${filter.name}`} onClick={() => handleEditSavedFilter(filter)}>
                      Edit
                    </button>
                    <button className="flex h-5 w-5 items-center justify-center rounded-full border-none bg-transparent" style={{ color: "var(--text-muted)" }} type="button" title={`Delete ${filter.name}`} aria-label={`Delete ${filter.name}`} onClick={() => handleDeleteSavedFilter(filter)}>
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Add category */}
          <div className="flex gap-2 mb-4 items-center">
            <input
              className="flex-1 max-w-xs px-3 py-1.5 rounded-lg border text-[13px] font-[inherit]"
              style={{ background: "var(--page-plane)", color: "var(--text-primary)", borderColor: "var(--border-color)", outline: "none" }}
              placeholder="New category name…"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddCategory(); }}
              onFocus={(e) => { e.target.style.outline = "1px solid var(--slot-1)"; }}
              onBlur={(e) => { e.target.style.outline = "none"; }}
            />
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] cursor-pointer font-[inherit] transition-colors"
              style={{ background: "var(--card-surface)", color: "var(--text-primary)", borderColor: "var(--border-color)" }}
              onClick={handleAddCategory} type="button"
            >
              <Plus size={12} /> Add category
            </button>
          </div>

          {/* Category filter chips */}
          <div className="flex gap-2 flex-wrap mb-4 items-center">
            {categoriesData.map((cat) => {
              const isActive = effectiveActiveCats.has(cat.id);
              return (
                <button
                  key={cat.id}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full border text-[12px] cursor-pointer font-[inherit] transition-colors"
                  style={{ background: "var(--card-surface)", color: isActive ? "var(--text-primary)" : "var(--text-secondary)", borderColor: isActive ? "var(--text-primary)" : "var(--border-color)" }}
                  onClick={() => toggleCat(cat.id)} type="button"
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: catColor(cat) }} />
                  {cat.name}
                </button>
              );
            })}
          </div>

          {isLoading && (
            <div className="text-center py-10 text-[13px]" style={{ color: "var(--text-muted)" }}>Loading your tasks…</div>
          )}

          {!isLoading && activeView === "today" && (
            <section className="rounded-2xl border p-4" style={{ background: "var(--page-plane)", borderColor: "var(--border-color)" }}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="m-0 text-[17px] font-semibold" style={{ color: "var(--text-primary)" }}>Today</h2>
                  <p className="m-0 mt-1 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    Unfinished tasks that are urgent or due today · {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" })}
                  </p>
                </div>
                <span className="rounded-full border px-2 py-1 text-[11px]" style={{ color: "var(--text-secondary)", borderColor: "var(--border-color)", background: "var(--card-surface)" }}>
                  {savedFilteredTodayTasks.length} task{savedFilteredTodayTasks.length === 1 ? "" : "s"}
                </span>
              </div>
              {savedFilteredTodayTasks.length > 0 ? (
                <div className="space-y-2">
                  {savedFilteredTodayTasks.map((task) => (
                    <TodayTaskRow
                      key={task.id}
                      task={task}
                      category={categoriesData.find((category) => category.id === task.categoryId)}
                      onUpdate={handleUpdateTask}
                      onDelete={handleDeleteTask}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed px-4 py-9 text-center" style={{ borderColor: "var(--border-color)", color: "var(--text-secondary)" }}>
                  Nothing matching this priority is urgent or due today. You have a clear runway.
                </div>
              )}
            </section>
          )}

          {!isLoading && activeView === "upcoming" && (
            <section className="rounded-2xl border p-4" style={{ background: "var(--page-plane)", borderColor: "var(--border-color)" }}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="m-0 text-[17px] font-semibold" style={{ color: "var(--text-primary)" }}>Upcoming</h2>
                  <p className="m-0 mt-1 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    Unfinished tasks due over the next 7 days, ranked by priority and due date
                  </p>
                </div>
                <span className="rounded-full border px-2 py-1 text-[11px]" style={{ color: "var(--text-secondary)", borderColor: "var(--border-color)", background: "var(--card-surface)" }}>
                  {savedFilteredUpcomingTasks.length} task{savedFilteredUpcomingTasks.length === 1 ? "" : "s"}
                </span>
              </div>
              {savedFilteredUpcomingTasks.length > 0 ? (
                <div className="space-y-2">
                  {savedFilteredUpcomingTasks.map((task) => (
                    <TodayTaskRow
                      key={task.id}
                      task={task}
                      category={categoriesData.find((category) => category.id === task.categoryId)}
                      onUpdate={handleUpdateTask}
                      onDelete={handleDeleteTask}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed px-4 py-9 text-center" style={{ borderColor: "var(--border-color)", color: "var(--text-secondary)" }}>
                  No unfinished tasks matching this priority are due in the next 7 days.
                </div>
              )}
            </section>
          )}

          {!isLoading && activeView === "high" && (
            <section className="rounded-2xl border p-4" style={{ background: "var(--page-plane)", borderColor: "var(--border-color)" }}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="m-0 text-[17px] font-semibold" style={{ color: "var(--text-primary)" }}>High priority</h2>
                  <p className="m-0 mt-1 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    All unfinished High priority tasks, independent of their category
                  </p>
                </div>
                <span className="rounded-full border px-2 py-1 text-[11px]" style={{ color: "var(--status-critical)", borderColor: "var(--status-critical)", background: "var(--card-surface)" }}>
                  {highPriorityTasks.length} task{highPriorityTasks.length === 1 ? "" : "s"}
                </span>
              </div>
              {highPriorityTasks.length > 0 ? (
                <div className="space-y-2">
                  {highPriorityTasks.map((task) => (
                    <TodayTaskRow
                      key={task.id}
                      task={task}
                      category={categoriesData.find((category) => category.id === task.categoryId)}
                      onUpdate={handleUpdateTask}
                      onDelete={handleDeleteTask}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed px-4 py-9 text-center" style={{ borderColor: "var(--border-color)", color: "var(--text-secondary)" }}>
                  No unfinished High priority tasks.
                </div>
              )}
            </section>
          )}

          {!isLoading && activeView === "calendar" && (
            <section className="rounded-2xl border p-3 sm:p-4" style={{ background: "var(--page-plane)", borderColor: "var(--border-color)" }}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="m-0 text-[17px] font-semibold" style={{ color: "var(--text-primary)" }}>Calendar</h2>
                  <p className="m-0 mt-1 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    Tasks organised by due date{priorityFilter !== "all" ? ` · ${priorityMeta(priorityFilter).label} priority filter` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: "var(--border-color)", background: "var(--card-surface)" }}>
                  <button className="flex h-7 w-7 items-center justify-center rounded border-none bg-transparent" type="button" onClick={() => handleCalendarMonthChange(-1)} aria-label="Previous month">
                    <ChevronLeft size={15} />
                  </button>
                  <span className="min-w-[122px] text-center text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                    {calendarMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                  </span>
                  <button className="flex h-7 w-7 items-center justify-center rounded border-none bg-transparent" type="button" onClick={() => handleCalendarMonthChange(1)} aria-label="Next month">
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 overflow-hidden rounded-xl border" style={{ borderColor: "var(--border-color)" }}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
                  <div key={weekday} className="border-b px-1 py-2 text-center text-[10px] font-semibold" style={{ background: "var(--card-surface)", color: "var(--text-secondary)", borderColor: "var(--border-color)" }}>{weekday}</div>
                ))}
                {calendarDays.map((day) => {
                  const dayKey = dateKey(day);
                  const dayTasks = calendarTaskGroups.get(dayKey) ?? [];
                  const inCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                  const isToday = dayKey === dateKey(new Date());
                  const selected = dayKey === selectedCalendarDate;
                  return (
                    <div
                      key={dayKey}
                      className="min-h-[82px] cursor-pointer border-b border-r p-1.5 transition-colors sm:min-h-[110px]"
                      style={{ background: selected ? "var(--card-surface)" : "transparent", borderColor: "var(--border-color)", opacity: inCurrentMonth ? 1 : 0.45, outline: selected ? "1px solid var(--slot-1)" : "none", outlineOffset: "-1px" }}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedCalendarDate(dayKey)}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedCalendarDate(dayKey); } }}
                      aria-label={`Select ${day.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold" style={{ color: isToday ? "white" : "var(--text-secondary)", background: isToday ? "var(--slot-1)" : "transparent" }}>{day.getDate()}</span>
                        {dayTasks.length > 0 && <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>{dayTasks.length}</span>}
                      </div>
                      <div className="space-y-1">
                        {dayTasks.slice(0, 2).map((task) => (
                          <div key={task.id} className="truncate rounded px-1 py-0.5 text-[9px] font-medium" style={{ color: priorityMeta(task.priority).color, background: "var(--drop-wash)" }} title={task.text}>
                            {task.text}
                          </div>
                        ))}
                        {dayTasks.length > 2 && <div className="px-1 text-[9px]" style={{ color: "var(--text-muted)" }}>+{dayTasks.length - 2} more</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4">
                <div className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {new Date(`${selectedCalendarDate}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                </div>
                {selectedCalendarTasks.length > 0 ? (
                  <div className="space-y-2">
                    {selectedCalendarTasks.map((task) => (
                      <TodayTaskRow
                        key={task.id}
                        task={task}
                        category={categoriesData.find((category) => category.id === task.categoryId)}
                        onUpdate={handleUpdateTask}
                        onDelete={handleDeleteTask}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed px-3 py-5 text-center text-[12px]" style={{ borderColor: "var(--border-color)", color: "var(--text-secondary)" }}>
                    No due tasks on this date.
                  </div>
                )}
              </div>
            </section>
          )}

          {!isLoading && activeView === "all" && (
            <SortableContext
              items={sortedCats.filter((c) => effectiveActiveCats.has(c.id)).map((c) => catDragId(c.id))}
              strategy={verticalListSortingStrategy}
            >
              {sortedCats
                .filter((cat) => effectiveActiveCats.has(cat.id))
                .map((cat) => (
                  <CategoryCard
                    key={cat.id}
                    cat={cat}
                    tasks={tasksData.filter((t) => t.categoryId === cat.id)}
                    query={query.toLowerCase()}
                    showCompleted={showCompleted}
                    priorityFilter={priorityFilter}
                    dueRange={dueRange}
                    onUpdateCat={handleUpdateCat}
                    onDeleteCat={handleDeleteCat}
                    onUpdateTask={handleUpdateTask}
                    onDeleteTask={handleDeleteTask}
                    onSwipeDelete={requestSwipeDelete}
                    onAddTask={handleAddTask}
                    onClearCompleted={handleClearCompleted}
                    newTaskId={newTaskId}
                    onNewTaskCommitted={() => setNewTaskId(null)}
                  />
                ))}
              {sortedCats.filter((c) => effectiveActiveCats.has(c.id)).length === 0 && (
                <div className="text-center py-10 text-[13px]" style={{ color: "var(--text-muted)" }}>
                  {query ? "No items match your search." : "No categories yet — add one above."}
                </div>
              )}
            </SortableContext>
          )}

          <footer className="text-center text-[11.5px] mt-6" style={{ color: "var(--text-muted)" }}>
            Stephen's To-Do Dashboard · Data saved server-side · accessible from any device
          </footer>
        </div>

        {/* Drag overlay — shown while dragging on all platforms */}
        <DragOverlay>
          {activeDragTask && (
            <div
              className="rounded-md px-2 py-1.5 text-[13.5px] shadow-lg"
              style={{ background: "var(--card-surface)", border: "1px solid var(--border-color)", opacity: 0.9, maxWidth: "400px" }}
            >
              {activeDragTask.text}
            </div>
          )}
          {activeDragCat && (
            <div
              className="rounded-xl px-4 py-3 text-[14.5px] font-semibold shadow-xl"
              style={{ background: "var(--card-surface)", border: "1px solid var(--border-color)", opacity: 0.9, maxWidth: "600px" }}
            >
              {activeDragCat.name}
            </div>
          )}
        </DragOverlay>

        <SwipeDeleteConfirmationDialog
          pendingDeletion={pendingSwipeDelete}
          onConfirm={confirmPendingSwipeDelete}
          onCancel={clearPendingSwipeDelete}
        />

        <style>{`
          @media (max-width: 640px) { .stats-grid { grid-template-columns: repeat(2, 1fr) !important; } }
          @media (hover: none) { .task-toolbar { opacity: 1 !important; } }
        `}</style>
      </div>
    </DndContext>
  );
}
