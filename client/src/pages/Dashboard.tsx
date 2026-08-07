import { useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";
import type { Category, Task } from "../../../drizzle/schema";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  GripVertical,
  Moon,
  Plus,
  Search,
  Sun,
  Trash2,
  FileDown,
  FileUp,
  StickyNote,
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
  allCatTasks: Task[];
  onUpdate: (id: number, data: Partial<Task>) => void;
  onDelete: (id: number, text: string) => void;
  onAddChild: (parentId: number, categoryId: number) => void;
  newTaskId?: number | null;
  onNewTaskCommitted?: () => void;
  isDragOverlay?: boolean;
}

function TaskItem({
  node, categoryId, depth, query, showCompleted, allCatTasks,
  onUpdate, onDelete, onAddChild,
  newTaskId, onNewTaskCommitted,
  isDragOverlay = false,
}: TaskItemProps) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const textInputRef = useRef<HTMLInputElement>(null);
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

  const hasChildren = node.children.length > 0;

  return (
    <>
      <li ref={setNodeRef} style={style} className="list-none">
        <div
          className="flex items-start gap-1 px-1.5 py-1 rounded-md select-none transition-colors duration-100"
          style={{
            background: hovered ? "var(--page-plane)" : "transparent",
          }}
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

          {/* Toolbar */}
          <span className="task-toolbar flex items-center gap-0.5 flex-shrink-0 transition-opacity duration-100" style={{ opacity: hovered ? 1 : 0 }}>
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
                  allCatTasks={allCatTasks}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
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

// ---- CategoryCard ----
interface CategoryCardProps {
  cat: Category;
  tasks: Task[];
  query: string;
  showCompleted: boolean;
  onUpdateCat: (id: number, data: Partial<Category>) => void;
  onDeleteCat: (id: number, name: string) => void;
  onUpdateTask: (id: number, data: Partial<Task>) => void;
  onDeleteTask: (id: number, text: string) => void;
  onAddTask: (catId: number, parentId?: number) => void;
  onClearCompleted: (catId: number) => void;
  newTaskId?: number | null;
  onNewTaskCommitted?: () => void;
}

function CategoryCard({
  cat, tasks, query, showCompleted,
  onUpdateCat, onDeleteCat, onUpdateTask, onDeleteTask, onAddTask, onClearCompleted,
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
  if (query && !hasMatchingItems) return null;

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
                  allCatTasks={tasks}
                  onUpdate={onUpdateTask}
                  onDelete={onDeleteTask}
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

  const [query, setQuery] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [activeCats, setActiveCats] = useState<Set<number> | null>(null);
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
  const exportQuery = trpc.data.export.useQuery(undefined, { enabled: false });
  const importMut = trpc.data.import.useMutation({
    onSuccess: () => { utils.categories.list.invalidate(); utils.tasks.listAll.invalidate(); toast.success("Snapshot imported successfully"); },
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
          createTaskMut.mutate({ categoryId: task.categoryId, parentId: task.parentId ?? undefined, text: task.text, sortOrder: task.sortOrder });
          toast.success(`"${text}" restored.`);
        },
      },
    });
  }, [deleteTaskMut, createTaskMut, tasksData]);

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
            createTaskMut.mutate({ categoryId: t.categoryId, parentId: t.parentId ?? undefined, text: t.text, sortOrder: t.sortOrder });
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
        const flatTasks: Array<{ tempId: string; categoryIndex: number; parentTempId: string | null; text: string; note: string; done: boolean; collapsed: boolean; sortOrder: number }> = [];
        if (parsed.tasks && Array.isArray(parsed.tasks)) {
          (parsed.tasks as Task[]).forEach((t, i) => {
            const catIdxReal = parsed.categories.findIndex((c: Category) => c.id === t.categoryId);
            flatTasks.push({
              tempId: `t${i}`, categoryIndex: catIdxReal >= 0 ? catIdxReal : 0,
              parentTempId: t.parentId ? `t${parsed.tasks.findIndex((pt: Task) => pt.id === t.parentId)}` : null,
              text: t.text, note: t.note ?? "", done: t.done ?? false, collapsed: t.collapsed ?? false, sortOrder: t.sortOrder ?? i,
            });
          });
        }
        importMut.mutate({ categories: cats, tasks: flatTasks });
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
          </div>

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

          {!isLoading && (
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
                    onUpdateCat={handleUpdateCat}
                    onDeleteCat={handleDeleteCat}
                    onUpdateTask={handleUpdateTask}
                    onDeleteTask={handleDeleteTask}
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

        <style>{`
          @media (max-width: 640px) { .stats-grid { grid-template-columns: repeat(2, 1fr) !important; } }
          @media (hover: none) { .task-toolbar { opacity: 1 !important; } }
        `}</style>
      </div>
    </DndContext>
  );
}
