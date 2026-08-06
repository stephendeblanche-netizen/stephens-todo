import { useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";
import type { Category, Task } from "../../../drizzle/schema";
import { useCallback, useMemo, useRef, useState } from "react";
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

// ---- Drag context (module-level ref to avoid prop drilling) ----
// We store the dragging task id in a module-level variable so all drop targets
// can read it without needing to pass it through every component.
let _draggingId: number | null = null;
// Module-level variable for category drag (separate from task drag)
let _draggingCatId: number | null = null;

// ---- Drop zone types ----
// "before" = insert before this task (same parent/category)
// "after"  = insert after this task (same parent/category)
// "child"  = nest as first child of this task
// "cat"    = drop as last top-level item in a category
type DropZoneType = "before" | "after" | "child" | "cat";

interface DropTarget {
  type: DropZoneType;
  taskId?: number;   // for before/after/child
  catId: number;
  parentId: number | null; // the new parentId after drop
  sortOrder: number;       // the new sortOrder after drop
}

// ---- DropLine — thin horizontal line between items ----
interface DropLineProps {
  catId: number;
  parentId: number | null;
  sortOrder: number;
  onDrop: (target: DropTarget) => void;
}
function DropLine({ catId, parentId, sortOrder, onDrop }: DropLineProps) {
  const [active, setActive] = useState(false);
  return (
    <li
      className="list-none"
      style={{ height: active ? "6px" : "3px", margin: "1px 0", transition: "height 0.1s" }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setActive(true); }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        e.preventDefault(); e.stopPropagation();
        setActive(false);
        if (_draggingId === null) return;
        onDrop({ type: "before", catId, parentId, sortOrder });
      }}
    >
      <div
        style={{
          height: "2px",
          borderRadius: "2px",
          background: active ? "var(--slot-1)" : "transparent",
          transition: "background 0.1s",
          margin: "0 8px",
        }}
      />
    </li>
  );
}

// ---- TaskItem ----
interface TaskItemProps {
  node: TaskNode;
  categoryId: number;
  depth: number;
  query: string;
  showCompleted: boolean;
  siblingCount: number;
  siblingIndex: number;
  onUpdate: (id: number, data: Partial<Task>) => void;
  onDelete: (id: number, text: string) => void;
  onAddChild: (parentId: number, categoryId: number) => void;
  onDragStart: (id: number) => void;
  onDrop: (target: DropTarget) => void;
}

function TaskItem({
  node, categoryId, depth, query, showCompleted,
  siblingCount, siblingIndex,
  onUpdate, onDelete, onAddChild, onDragStart, onDrop,
}: TaskItemProps) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [nestTarget, setNestTarget] = useState(false);
  const [hovered, setHovered] = useState(false);

  if (node.done && !showCompleted) return null;
  if (query && !matchesSearch(node, query)) return null;

  const hasChildren = node.children.length > 0;
  const visibleChildren = node.children.filter(
    (c) => (showCompleted || !c.done) && (!query || matchesSearch(c, query))
  );

  return (
    <>
      {/* Drop zone BEFORE this item */}
      <DropLine
        catId={categoryId}
        parentId={node.parentId ?? null}
        sortOrder={siblingIndex}
        onDrop={onDrop}
      />

      <li className="list-none">
        {/* Main row — nest-on-hover drop target */}
        <div
          className="flex items-start gap-1 px-1.5 py-1 rounded-md cursor-grab select-none transition-colors duration-100"
          style={{
            background: nestTarget
              ? "var(--drop-wash)"
              : hovered ? "var(--page-plane)" : "transparent",
            outline: nestTarget ? "1px dashed var(--slot-1)" : "none",
          }}
          draggable
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onDragStart={(e) => { e.stopPropagation(); _draggingId = node.id; onDragStart(node.id); }}
          onDragEnd={() => { _draggingId = null; }}
          onDragOver={(e) => {
            // Only activate nest-target if dragging over the centre of the row
            // (not the top/bottom 30% which is handled by DropLines)
            e.preventDefault(); e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const relY = e.clientY - rect.top;
            const pct = relY / rect.height;
            setNestTarget(pct > 0.3 && pct < 0.7);
          }}
          onDragLeave={(e) => { e.stopPropagation(); setNestTarget(false); }}
          onDrop={(e) => {
            e.preventDefault(); e.stopPropagation();
            setNestTarget(false);
            if (_draggingId === null || _draggingId === node.id) return;
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const relY = e.clientY - rect.top;
            const pct = relY / rect.height;
            if (pct > 0.3 && pct < 0.7) {
              // Nest as child
              onDrop({ type: "child", taskId: node.id, catId: categoryId, parentId: node.id, sortOrder: node.children.length });
            }
            // top/bottom handled by DropLines
          }}
        >
          {/* Drag handle */}
          <span className="mt-1 flex-shrink-0 cursor-grab" style={{ color: "var(--text-muted)", opacity: hovered ? 1 : 0, transition: "opacity 0.1s" }}>
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
            className="flex-1 min-w-0 border-none bg-transparent px-1 py-0.5 rounded text-[13.5px] leading-relaxed font-[inherit]"
            style={{
              outline: "none",
              color: node.done ? "var(--text-muted)" : "var(--text-primary)",
              textDecoration: node.done ? "line-through" : "none",
              fontWeight: hasChildren ? 600 : 400,
            }}
            defaultValue={node.text}
            onBlur={(e) => { if (e.target.value !== node.text) onUpdate(node.id, { text: e.target.value }); }}
            onFocus={(e) => { e.target.style.background = "var(--surface-1)"; e.target.style.outline = "1px solid var(--border-color)"; }}
            onBlurCapture={(e) => { e.target.style.background = "transparent"; e.target.style.outline = "none"; }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />

          {/* Toolbar */}
          <span className="flex items-center gap-0.5 flex-shrink-0 transition-opacity duration-100" style={{ opacity: hovered ? 1 : 0 }}>
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
              placeholder="Add a note\u2026"
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
            {node.children.map((child, idx) => (
              <TaskItem
                key={child.id}
                node={child}
                categoryId={categoryId}
                depth={depth + 1}
                query={query}
                showCompleted={showCompleted}
                siblingCount={node.children.length}
                siblingIndex={idx}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onAddChild={onAddChild}
                onDragStart={onDragStart}
                onDrop={onDrop}
              />
            ))}
            {/* Drop zone after last child */}
            <DropLine
              catId={categoryId}
              parentId={node.id}
              sortOrder={node.children.length}
              onDrop={onDrop}
            />
          </ul>
        )}
      </li>

      {/* Drop zone AFTER last sibling */}
      {siblingIndex === siblingCount - 1 && (
        <DropLine
          catId={categoryId}
          parentId={node.parentId ?? null}
          sortOrder={siblingCount}
          onDrop={onDrop}
        />
      )}
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
  onDragStart: (taskId: number) => void;
  onDrop: (target: DropTarget) => void;
}

// ---- CatDropLine — thin line between category cards ----
interface CatDropLineProps {
  insertBefore: number; // sortOrder position to insert at
  onCatDrop: (insertBefore: number) => void;
}
function CatDropLine({ insertBefore, onCatDrop }: CatDropLineProps) {
  const [active, setActive] = useState(false);
  return (
    <div
      style={{ height: active ? "8px" : "4px", margin: "2px 0", transition: "height 0.1s", position: "relative" }}
      onDragOver={(e) => {
        // Only activate for category drags, not task drags
        if (_draggingCatId === null) return;
        e.preventDefault(); e.stopPropagation(); setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(e) => {
        if (_draggingCatId === null) return;
        e.preventDefault(); e.stopPropagation();
        setActive(false);
        onCatDrop(insertBefore);
      }}
    >
      <div style={{
        height: "2px", borderRadius: "2px", margin: "0 8px",
        background: active ? "var(--slot-2)" : "transparent",
        transition: "background 0.1s",
      }} />
    </div>
  );
}

function CategoryCard({
  cat, tasks, query, showCompleted,
  onUpdateCat, onDeleteCat, onUpdateTask, onDeleteTask, onAddTask, onDragStart, onDrop,
}: CategoryCardProps) {
  const [catDropTarget, setCatDropTarget] = useState(false);
  const [isDraggingThis, setIsDraggingThis] = useState(false);
  const tree = useMemo(() => buildTree(tasks), [tasks]);
  const { total, done } = useMemo(() => countNodes(tree), [tree]);
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;
  const color = catColor(cat);

  const hasMatchingItems = !query || tasks.some((t) => t.text.toLowerCase().includes(query) || t.note.toLowerCase().includes(query));
  if (query && !hasMatchingItems) return null;

  return (
    <div
      className="rounded-2xl mb-3.5 overflow-hidden transition-colors duration-100"
      style={{
        background: catDropTarget ? "var(--drop-wash)" : "var(--card-surface)",
        border: cat.kind === "urgent" ? "1.5px solid var(--status-critical)" : "1px solid var(--border-color)",
      }}
      draggable
      onDragStart={(e) => {
        // Only start category drag if the drag handle was clicked
        // We use a data attribute set on the handle to gate this
        const handle = (e.target as HTMLElement).closest("[data-cat-drag-handle]");
        if (!handle) { e.preventDefault(); return; }
        _draggingCatId = cat.id;
        setIsDraggingThis(true);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => { _draggingCatId = null; setIsDraggingThis(false); }}
      onDragOver={(e) => { e.preventDefault(); setCatDropTarget(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setCatDropTarget(false); }}
      onDrop={(e) => {
        setCatDropTarget(false);
        // Only handle drops that land directly on the card (not on a task row or drop-line)
        const target = e.target as HTMLElement;
        if (target.closest("[data-task-item]") || target.closest("[data-drop-line]")) return;
        e.preventDefault();
        if (_draggingId === null) return;
        const topLevel = tasks.filter((t) => (t.parentId ?? null) === null);
        onDrop({ type: "cat", catId: cat.id, parentId: null, sortOrder: topLevel.length });
      }}
      data-cat-id={cat.id}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2.5 px-4 py-3 select-none">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Category drag handle */}
          <span
            data-cat-drag-handle
            className="flex-shrink-0 cursor-grab"
            style={{ color: "var(--text-muted)", opacity: 0.4, transition: "opacity 0.1s" }}
            title="Drag to reorder category"
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.4"; }}
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
          <ul className="list-none m-0 p-0 min-h-[6px]" data-cat-body={cat.id}>
            {/* Drop zone at very top of empty/non-empty list */}
            {tree.length === 0 && (
              <DropLine catId={cat.id} parentId={null} sortOrder={0} onDrop={onDrop} />
            )}
            {tree.map((node, idx) => (
              <TaskItem
                key={node.id}
                node={node}
                categoryId={cat.id}
                depth={0}
                query={query}
                showCompleted={showCompleted}
                siblingCount={tree.length}
                siblingIndex={idx}
                onUpdate={onUpdateTask}
                onDelete={onDeleteTask}
                onAddChild={(parentId, catId) => onAddTask(catId, parentId)}
                onDragStart={onDragStart}
                onDrop={onDrop}
              />
            ))}
          </ul>
          {!query && (
            <button
              className="mt-1.5 text-[12px] bg-transparent border-none cursor-pointer font-[inherit] px-1.5 py-1 transition-colors"
              style={{ color: "var(--text-muted)" }}
              onClick={() => onAddTask(cat.id)}
              type="button"
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; (e.currentTarget as HTMLButtonElement).style.textDecoration = "underline"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLButtonElement).style.textDecoration = "none"; }}
            >
              + Add item
            </button>
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
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);

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
  const reorderTaskMut = trpc.tasks.reorder.useMutation({ onSuccess: () => utils.tasks.listAll.invalidate() });
  const exportQuery = trpc.data.export.useQuery(undefined, { enabled: false });
  const reorderCatMut = trpc.categories.reorder.useMutation({ onSuccess: () => utils.categories.list.invalidate() });
  const importMut = trpc.data.import.useMutation({
    onSuccess: () => { utils.categories.list.invalidate(); utils.tasks.listAll.invalidate(); toast.success("Snapshot imported successfully"); },
    onError: () => toast.error("Could not import — is this a valid dashboard export?"),
  });

  const effectiveActiveCats = useMemo(() => {
    if (activeCats !== null) return activeCats;
    return new Set(categoriesData.map((c) => c.id));
  }, [activeCats, categoriesData]);

  const stats = useMemo(() => {
    let total = 0, done = 0, urgent = 0;
    for (const cat of categoriesData) {
      const catTasks = tasksData.filter((t) => t.categoryId === cat.id);
      const tree = buildTree(catTasks);
      const counts = countNodes(tree);
      total += counts.total; done += counts.done;
      if (cat.kind === "urgent") urgent = counts.total;
    }
    return { total, done, urgent, categories: categoriesData.length };
  }, [categoriesData, tasksData]);

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

  const handleAddTask = useCallback((catId: number, parentId?: number) => {
    const siblings = tasksData.filter((t) => t.categoryId === catId && (t.parentId ?? null) === (parentId ?? null));
    createTaskMut.mutate({ categoryId: catId, parentId, text: "New item", sortOrder: siblings.length });
  }, [createTaskMut, tasksData]);

  const handleAddCategory = useCallback(() => {
    const name = newCatName.trim();
    if (!name) return;
    const usedColors = new Set(categoriesData.map((c) => c.colorIndex));
    let colorIndex = 0;
    while (usedColors.has(colorIndex) && colorIndex < 7) colorIndex++;
    createCatMut.mutate({ name, kind: "normal", colorIndex, sortOrder: categoriesData.length });
    setNewCatName("");
  }, [newCatName, categoriesData, createCatMut]);

  // ---- Category drop handler ----
  const handleCatDrop = useCallback((insertBefore: number) => {
    const id = _draggingCatId;
    if (id === null) return;
    _draggingCatId = null;

    // Always work against the full sorted list (not just visible filtered cats)
    // so the resulting sortOrder values are globally consistent.
    const sorted = [...categoriesData].sort((a, b) => a.sortOrder - b.sortOrder);
    const dragged = sorted.find((c) => c.id === id);
    if (!dragged) return;

    // The insertBefore index is relative to the visible (filtered) list.
    // Map it back to the full list: find the category at that visible position.
    const visible = sorted.filter((c) => effectiveActiveCats.has(c.id));
    // The category that will be just after the drop point in the visible list
    const afterCat = visible[insertBefore] ?? null;

    // Remove dragged from full list, then insert just before afterCat (or at end)
    const without = sorted.filter((c) => c.id !== id);
    const insertIdx = afterCat ? without.findIndex((c) => c.id === afterCat.id) : without.length;
    without.splice(insertIdx < 0 ? without.length : insertIdx, 0, dragged);

    const updates = without.map((c, i) => ({ id: c.id, sortOrder: i }));
    reorderCatMut.mutate(updates);
  }, [categoriesData, effectiveActiveCats, reorderCatMut]);

  // ---- Central task drop handler ----
  const handleDrop = useCallback((target: DropTarget) => {
    const id = _draggingId;
    if (id === null) return;
    if (id === target.taskId) return; // can't drop on itself

    // Recalculate sortOrder among siblings at the destination to avoid gaps
    const siblings = tasksData
      .filter((t) => t.categoryId === target.catId && (t.parentId ?? null) === target.parentId && t.id !== id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    // Insert at the desired position and renumber
    const updates: Array<{ id: number; sortOrder: number; parentId: number | null; categoryId: number }> = [];
    siblings.splice(target.sortOrder, 0, { id, sortOrder: 0, categoryId: target.catId, parentId: target.parentId } as Task);
    siblings.forEach((t, i) => {
      updates.push({ id: t.id, sortOrder: i, parentId: target.parentId, categoryId: target.catId });
    });

    reorderTaskMut.mutate(updates);
    _draggingId = null;
    setDraggingTaskId(null);
  }, [tasksData, reorderTaskMut]);

  const handleExport = useCallback(async () => {
    const result = await exportQuery.refetch();
    if (!result.data) return;
    const payload = JSON.stringify(result.data, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    a.download = `todo-dashboard-${stamp}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  const isLoading = catsLoading || tasksLoading;

  return (
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
          <div>
            {/* Drop line before first category */}
            <CatDropLine insertBefore={0} onCatDrop={handleCatDrop} />
            {categoriesData
              .filter((cat) => effectiveActiveCats.has(cat.id))
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((cat, idx, arr) => (
                <div key={cat.id}>
                  <CategoryCard
                    cat={cat}
                    tasks={tasksData.filter((t) => t.categoryId === cat.id)}
                    query={query.toLowerCase()}
                    showCompleted={showCompleted}
                    onUpdateCat={handleUpdateCat}
                    onDeleteCat={handleDeleteCat}
                    onUpdateTask={handleUpdateTask}
                    onDeleteTask={handleDeleteTask}
                    onAddTask={handleAddTask}
                    onDragStart={setDraggingTaskId}
                    onDrop={handleDrop}
                  />
                  {/* Drop line after each category */}
                  <CatDropLine insertBefore={idx + 1} onCatDrop={handleCatDrop} />
                </div>
              ))}
            {categoriesData.filter((c) => effectiveActiveCats.has(c.id)).length === 0 && (
              <div className="text-center py-10 text-[13px]" style={{ color: "var(--text-muted)" }}>
                {query ? "No items match your search." : "No categories yet — add one above."}
              </div>
            )}
          </div>
        )}

        <footer className="text-center text-[11.5px] mt-6" style={{ color: "var(--text-muted)" }}>
          Stephen's To-Do Dashboard · Data saved server-side · accessible from any device
        </footer>
      </div>

      <style>{`
        @media (max-width: 640px) { .stats-grid { grid-template-columns: repeat(2, 1fr) !important; } }
        @media (hover: none) { .task-toolbar { opacity: 1 !important; } }
      `}</style>
    </div>
  );
}
