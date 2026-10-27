import * as Haptics from "expo-haptics";
import NetInfo from "@react-native-community/netinfo";
import { StatusBar } from "expo-status-bar";
import DateTimePicker from "@react-native-community/datetimepicker";
import { GestureHandlerRootView, Swipeable } from "react-native-gesture-handler";
import DraggableFlatList from "react-native-draggable-flatlist";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, FlatList, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { createCategoryRemote, createDirectReportRemote, createTaskRemote, deleteCategoryRemote, deleteDirectReportRemote, deleteTaskRemote, getDashboard, reorderCategoriesRemote, reorderTasksRemote, updateCategoryRemote, updateDirectReportRemote } from "./src/api";
import { addTemporaryTask, applyTaskPatch, cacheDashboard, enqueueMutation, flushQueuedMutations, loadCachedDashboard, queueLength } from "./src/offlineSync";
import { configurePushReminders, remindersEnabled } from "./src/notifications";
import { dueText, orderTasks, priorityColor, taskMatchesPriority, type OrderedTask } from "./src/taskUtils";
import { buildBulkTaskMoveUpdates, buildTaskMoveUpdates, buildTaskReorderUpdates, isValidMoveParent, type TaskMoveDestination } from "./src/taskMovement";
import type { Category, DashboardPayload, DirectReport, Priority, Recurrence, Task, TaskCreateInput, TaskPatch } from "./src/types";

const haptic = () => { if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };
const priorities: Array<"all" | Priority> = ["all", "high", "medium", "low"];
const categoryColours = ["#2A78D6", "#EB6834", "#1BAF7A", "#EDA100", "#E87BA4", "#008300", "#4A3AA7", "#E34948"];
type WorkView = "myDay" | "all" | "upcoming" | "high" | "calendar";
const workViewOptions: Array<{ id: WorkView; label: string; hint: string }> = [
  { id: "myDay", label: "My Day", hint: "Urgent work and tasks due today, with your Top 3 focus." },
  { id: "all", label: "All tasks", hint: "Every task matching your category, priority, colleague, and completion filters." },
  { id: "upcoming", label: "Upcoming", hint: "Unfinished tasks due during the next 7 days." },
  { id: "high", label: "High priority", hint: "All unfinished high-priority tasks." },
  { id: "calendar", label: "Calendar", hint: "A due-date agenda for unfinished scheduled work." },
];
const startOfLocalDay = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
const isDueToday = (dueAt: number | null, now = new Date()) => dueAt !== null && new Date(dueAt).getFullYear() === now.getFullYear() && new Date(dueAt).getMonth() === now.getMonth() && new Date(dueAt).getDate() === now.getDate();
const isDueWithinNextSevenDays = (dueAt: number | null, now = new Date()) => dueAt !== null && dueAt >= startOfLocalDay(now) && dueAt < startOfLocalDay(now) + 7 * 24 * 60 * 60 * 1000;
const agendaDateLabel = (dueAt: number | null) => dueAt === null ? "Unscheduled" : new Date(dueAt).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
type Sheet = "menu" | "filters" | "task" | "category" | "subCategory" | "directReport" | "emailComposer" | "manageCategories" | "manageReports" | "reorderSubcategories" | "reorderTasks" | "moveTask" | "bulkMove" | "selectCategory" | "selectParent" | "selectLandingCategory" | "selectLandingResponsibleColleague" | "selectWorkView" | null;
const categoryColour = (colourIndex: number) => categoryColours[colourIndex % categoryColours.length] ?? categoryColours[0]!;
const taskResponsibleColleagueIds = (task: Task) => task.responsibleColleagueIds ?? (task.accountableDirectReportId === null ? [] : [task.accountableDirectReportId]);
const sameColleagueIds = (left: number[], right: number[]) => left.length === right.length && left.every((id, index) => id === right[index]);

function TaskRow({ task, category, directReports, save, onCreateSubcategory, onReorderSubcategories, onMoveTask, onDeleteTask, selectionMode, selected, onToggleSelection, focused = false, onFocus, inspectorMode = false, inlineDetailsEnabled = true, focusOnPriority = false }: { task: OrderedTask; category?: Category; directReports: DirectReport[]; save: (patch: TaskPatch) => Promise<void>; onCreateSubcategory: (parent: Task) => void; onReorderSubcategories: (parent: Task) => void; onMoveTask: (task: Task) => void; onDeleteTask: (task: Task) => void; selectionMode: boolean; selected: boolean; onToggleSelection: (taskId: number) => void; focused?: boolean; onFocus?: (task: Task) => void; inspectorMode?: boolean; inlineDetailsEnabled?: boolean; focusOnPriority?: boolean }) {
  const [open, setOpen] = useState(inspectorMode && inlineDetailsEnabled);
  const [taskName, setTaskName] = useState(task.text);
  const [note, setNote] = useState(task.note);
  const [responsibleColleagueIds, setResponsibleColleagueIds] = useState(() => taskResponsibleColleagueIds(task));
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const editingTaskName = useRef(false);
  const pendingTaskName = useRef<string | null>(null);
  const awaitingOptimisticTaskName = useRef(false);
  const renderedTaskId = useRef(task.id);
  const pendingResponsibleColleagueIds = useRef<number[] | null>(null);
  useEffect(() => {
    if (renderedTaskId.current !== task.id) {
      renderedTaskId.current = task.id;
      editingTaskName.current = false;
      pendingTaskName.current = null;
      awaitingOptimisticTaskName.current = false;
      setTaskName(task.text);
      return;
    }
    const pendingName = pendingTaskName.current;
    if (pendingName) {
      if (task.text !== pendingName || awaitingOptimisticTaskName.current) {
        awaitingOptimisticTaskName.current = false;
        return;
      }
      pendingTaskName.current = null;
    }
    if (editingTaskName.current) return;
    setTaskName(task.text);
  }, [task.id, task.text]);
  useEffect(() => {
    const persistedIds = taskResponsibleColleagueIds(task);
    if (pendingResponsibleColleagueIds.current && !sameColleagueIds(persistedIds, pendingResponsibleColleagueIds.current)) return;
    pendingResponsibleColleagueIds.current = null;
    setResponsibleColleagueIds(persistedIds);
  }, [task.id, task.responsibleColleagueIds, task.accountableDirectReportId]);
  useEffect(() => {
    if (inspectorMode) { setOpen(true); return; }
    if (!inlineDetailsEnabled) setOpen(false);
  }, [inlineDetailsEnabled, inspectorMode, task.id]);
  const action = (patch: TaskPatch) => { haptic(); void save(patch); };
  const isNested = task.hierarchyDepth > 0;
  const nestingOffset = Math.min(task.hierarchyDepth, 3) * 16;
  const dueDateLabel = task.dueAt === null ? "No due date" : new Date(task.dueAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const displayTaskName = pendingTaskName.current ?? task.text;
  const saveTaskName = () => {
    const trimmedName = taskName.trim();
    if (!trimmedName || trimmedName === task.text || pendingTaskName.current === trimmedName) return;
    pendingTaskName.current = trimmedName;
    awaitingOptimisticTaskName.current = true;
    setTaskName(trimmedName);
    action({ text: trimmedName });
  };
  const finishTaskNameEditing = () => { editingTaskName.current = false; saveTaskName(); };
  const card = <View style={[styles.card, isNested && styles.nestedCard, isNested && { marginLeft: nestingOffset, borderLeftColor: category ? categoryColour(category.colorIndex) : "#155E4A" }, task.done && styles.done, selected && styles.selectedCard, focused && !selectionMode && styles.focusedCard]}>
    <View style={styles.row}>
      <Pressable accessibilityRole="checkbox" accessibilityState={selectionMode ? { checked: selected, selected } : { checked: task.done }} accessibilityLabel={selectionMode ? `${selected ? "Deselect" : "Select"} ${displayTaskName}` : task.done ? `Mark ${displayTaskName} incomplete` : `Mark ${displayTaskName} complete`} onPress={() => selectionMode ? onToggleSelection(task.id) : action({ done: !task.done })} style={[styles.check, selectionMode ? selected && styles.selectionCheckOn : task.done && styles.checkOn]}><Text style={styles.checkMark}>{(selectionMode ? selected : task.done) ? "✓" : ""}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open, selected: focused }} accessibilityLabel={`Open ${displayTaskName}${focused ? ", selected" : ""}`} onPress={() => { haptic(); onFocus?.(task); if (!inspectorMode && inlineDetailsEnabled) setOpen((isOpen) => !isOpen); }} style={styles.content}>{isNested && <Text numberOfLines={1} style={styles.hierarchyLabel}>↳ Subtask of {task.parentTaskText ?? "parent task"}</Text>}<Text style={[styles.title, task.done && styles.strike]} numberOfLines={2}>{displayTaskName}</Text><Text style={styles.meta}>{category?.name ?? "Tasks"} · {dueText(task.dueAt)}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Change priority for ${displayTaskName}`} onPress={() => { haptic(); if (focusOnPriority) onFocus?.(task); if (inlineDetailsEnabled) setOpen((isOpen) => !isOpen); }} style={[styles.flag, { borderColor: priorityColor(task.priority) }]}><Text numberOfLines={1} style={{ color: priorityColor(task.priority), fontWeight: "700", fontSize: 11 }}>⚑ {task.priority}</Text></Pressable>
    </View>
    {open && inlineDetailsEnabled && <View style={styles.details}>
      <Text style={styles.label}>Task name</Text><TextInput value={taskName} onChangeText={setTaskName} onFocus={() => { editingTaskName.current = true; }} onBlur={finishTaskNameEditing} onSubmitEditing={finishTaskNameEditing} returnKeyType="done" accessibilityLabel={`Task name for ${displayTaskName}`} style={styles.taskNameInput} />
      <Text style={styles.label}>Priority</Text><View style={styles.detailChips}>{(["high", "medium", "low"] as Priority[]).map((entry) => <Pressable key={entry} accessibilityRole="button" accessibilityLabel={`Set priority ${entry}`} onPress={() => action({ priority: entry })} style={[styles.chip, task.priority === entry && { borderColor: priorityColor(entry), backgroundColor: "#FFFFFF" }]}><Text style={{ color: priorityColor(entry), fontSize: 12, fontWeight: "700" }}>{entry}</Text></Pressable>)}</View>
      <Text style={styles.label}>Responsible Colleagues</Text><View style={styles.detailChips}><Pressable accessibilityRole="button" accessibilityLabel={`Assign no Responsible Colleagues to ${task.text}`} onPress={() => { pendingResponsibleColleagueIds.current = []; setResponsibleColleagueIds([]); action({ responsibleColleagueIds: [] }); }} style={[styles.chip, responsibleColleagueIds.length === 0 && styles.chipOn]}><Text style={styles.chipText}>N/A</Text></Pressable>{directReports.map((report) => { const assigned = responsibleColleagueIds.includes(report.id); return <Pressable key={report.id} accessibilityRole="button" accessibilityState={{ selected: assigned }} accessibilityLabel={`${assigned ? "Remove" : "Assign"} Responsible Colleague ${report.name} ${assigned ? "from" : "to"} ${task.text}`} onPress={() => { const next = assigned ? responsibleColleagueIds.filter((id) => id !== report.id) : [...responsibleColleagueIds, report.id]; pendingResponsibleColleagueIds.current = next; setResponsibleColleagueIds(next); action({ responsibleColleagueIds: next }); }} style={[styles.chip, assigned && styles.chipOn]}><Text style={styles.chipText}>{report.name}</Text></Pressable>; })}</View>
      <View style={styles.taskSchedule}><Text style={styles.label}>Schedule</Text><View style={styles.dueDateRow}><Pressable accessibilityRole="button" accessibilityLabel={`Choose due date for ${task.text}`} onPress={() => { Keyboard.dismiss(); setShowSchedulePicker((visible) => !visible); }} style={styles.dueDateButton}><Text style={styles.dueDateText}>{dueDateLabel}</Text><Text style={styles.destinationChevron}>›</Text></Pressable>{task.dueAt !== null && <Pressable accessibilityRole="button" accessibilityLabel={`Clear due date for ${task.text}`} onPress={() => { setShowSchedulePicker(false); action({ dueAt: null }); }} style={styles.clearDueDate}><Text style={styles.clearDueDateText}>Clear</Text></Pressable>}</View>{showSchedulePicker && <DateTimePicker value={task.dueAt === null ? new Date() : new Date(task.dueAt)} mode="date" display={Platform.OS === "ios" ? "compact" : "default"} onChange={(_, selectedDate) => { if (Platform.OS !== "ios") setShowSchedulePicker(false); if (selectedDate) action({ dueAt: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).getTime() }); }} />}<Text style={styles.label}>Repeat</Text><View style={styles.detailChips}>{(["none", "daily", "weekly", "monthly"] as Recurrence[]).map((entry) => <Pressable key={entry} accessibilityRole="button" accessibilityLabel={`Set repeat ${entry} for ${task.text}`} onPress={() => action({ recurrence: entry })} style={[styles.chip, task.recurrence === entry && styles.chipOn]}><Text style={styles.chipText}>{entry === "none" ? "Does not repeat" : entry}</Text></Pressable>)}</View></View>
      <View style={styles.subcategoryActions}><Pressable accessibilityRole="button" accessibilityLabel={`Move task ${task.text}`} onPress={() => onMoveTask(task)} style={styles.subcategoryAction}><Text style={styles.subcategoryActionText}>↗ Move task</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Add Subtask under ${task.text}`} onPress={() => onCreateSubcategory(task)} style={styles.subcategoryAction}><Text style={styles.subcategoryActionText}>＋ Add Subtask</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Reorder Subtasks under ${task.text}`} onPress={() => onReorderSubcategories(task)} style={styles.subcategoryAction}><Text style={styles.subcategoryActionText}>↕ Reorder Subtasks</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Delete task ${task.text}`} onPress={() => onDeleteTask(task)} style={styles.subcategoryAction}><Text style={styles.deleteTaskActionText}>⌫ Delete task</Text></Pressable></View>
      <Text style={styles.label}>Notes</Text><TextInput value={note} onChangeText={setNote} onBlur={() => note !== task.note && action({ note })} placeholder="Add a note…" multiline accessibilityLabel={`Notes for ${task.text}`} style={styles.notes} />
    </View>}
  </View>;
  if (selectionMode) return card;
  return <Swipeable overshootRight={false} renderRightActions={() => <Pressable accessibilityRole="button" accessibilityLabel={`Swipe delete ${task.text}`} onPress={() => onDeleteTask(task)} style={styles.swipeDelete}><Text style={styles.swipeDeleteText}>Delete</Text></Pressable>}>{card}</Swipeable>;
}

function CategoryManagerSheet({ categories, height, onMove, onEdit, onDelete, onDone }: { categories: Category[]; height: number; onMove: (categoryId: number, direction: -1 | 1) => void; onEdit: (category: Category) => void; onDelete: (category: Category) => void; onDone: () => void }) {
  return <View style={[styles.modal, styles.managementModal, { height }]}><View style={styles.reorderHeader}><View style={styles.reorderHeaderCopy}><Text style={styles.modalTitle}>Manage & reorder categories</Text><Text style={styles.modalHint}>Use the arrow buttons to reorder. Edit or Delete a category at the right.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close category management" onPress={onDone} style={styles.finishReorder}><Text style={styles.finishReorderText}>Done</Text></Pressable></View><ScrollView style={styles.managementScroll} contentContainerStyle={styles.managementList} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>{categories.length ? categories.map((item, index) => <View key={item.id} style={styles.managementRow}><View style={[styles.managementColour, { backgroundColor: categoryColour(item.colorIndex) }]} /><Text numberOfLines={1} style={styles.managementName}>{item.name}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Move category ${item.name} up`} disabled={index === 0} onPress={() => onMove(item.id, -1)} style={[styles.managementMove, index === 0 && styles.managementMoveDisabled]}><Text style={styles.managementMoveText}>↑</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Move category ${item.name} down`} disabled={index === categories.length - 1} onPress={() => onMove(item.id, 1)} style={[styles.managementMove, index === categories.length - 1 && styles.managementMoveDisabled]}><Text style={styles.managementMoveText}>↓</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Edit category ${item.name}`} onPress={() => onEdit(item)}><Text style={styles.editAction}>Edit</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Delete category ${item.name}`} onPress={() => onDelete(item)}><Text style={styles.deleteAction}>Delete</Text></Pressable></View>) : <Text style={styles.modalHint}>No categories yet. Add one from the Add menu.</Text>}</ScrollView></View>;
}

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [workView, setWorkView] = useState<WorkView>("myDay");
  const [category, setCategory] = useState<number | "all">("all");
  const [priority, setPriority] = useState<"all" | Priority>("all");
  const [responsibleColleagueFilter, setResponsibleColleagueFilter] = useState<number | "all" | "unassigned">("all");
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [text, setText] = useState("");
  const [categoryColourIndex, setCategoryColourIndex] = useState(0);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingReport, setEditingReport] = useState<DirectReport | null>(null);
  const [subCategoryParent, setSubCategoryParent] = useState<Task | null>(null);
  const [selectedDestinationCategoryId, setSelectedDestinationCategoryId] = useState<number | null>(null);
  const [selectedParentTaskId, setSelectedParentTaskId] = useState<number | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newParentTaskName, setNewParentTaskName] = useState("");
  const [creatingNewCategory, setCreatingNewCategory] = useState(false);
  const [creatingNewParent, setCreatingNewParent] = useState(false);
  const [destinationPickerOrigin, setDestinationPickerOrigin] = useState<"task" | "subCategory" | null>(null);
  const [reorderParent, setReorderParent] = useState<Task | null>(null);
  const [reorderCategoryId, setReorderCategoryId] = useState<number | null>(null);
  const [movingTask, setMovingTask] = useState<Task | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [focusedTaskId, setFocusedTaskId] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [hasCachedWorkspace, setHasCachedWorkspace] = useState(false);
  const [reminders, setReminders] = useState(false);
  const [savingEntity, setSavingEntity] = useState(false);
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>("medium");
  const [newTaskDueAt, setNewTaskDueAt] = useState<number | null>(null);
  const [newTaskRecurrence, setNewTaskRecurrence] = useState<Recurrence>("none");
  const [newTaskResponsibleColleagueIds, setNewTaskResponsibleColleagueIds] = useState<number[]>([]);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [taskControlsVisible, setTaskControlsVisible] = useState(true);
  const [topThreeExpanded, setTopThreeExpanded] = useState(true);
  const [inspectorPaneEnabled, setInspectorPaneEnabled] = useState(true);
  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailReview, setEmailReview] = useState(false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const newCategoryInputRef = useRef<TextInput>(null);
  const taskFormScrollRef = useRef<ScrollView>(null);
  const sheetRef = useRef<Sheet>(null);
  const appStateRef = useRef(AppState.currentState);
  const syncing = useRef(false);
  const savingEntityRef = useRef(false);
  const load = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true; setError(null);
    try { const replayed = await flushQueuedMutations(); const fresh = replayed ?? await getDashboard(); setDashboard(fresh); setHasCachedWorkspace(true); await cacheDashboard(fresh); setPending(await queueLength()); }
    catch (reason) { const cached = await loadCachedDashboard(); if (cached) { setDashboard(cached); setHasCachedWorkspace(true); } else { setHasCachedWorkspace(false); setError(online ? (reason instanceof Error ? reason.message : "Could not load tasks") : "No offline workspace is available yet."); } }
    finally { syncing.current = false; setLoading(false); }
  }, []);
  useEffect(() => {
    let mounted = true;
    void (async () => { const cached = await loadCachedDashboard(); if (mounted && cached) { setDashboard(cached); setHasCachedWorkspace(true); setLoading(false); } if (mounted) { setReminders(await remindersEnabled()); setPending(await queueLength()); } const state = await NetInfo.fetch(); const connected = Boolean(state.isConnected && state.isInternetReachable !== false); if (mounted) { setOnline(connected); if (connected) void load(); else if (!cached) { setHasCachedWorkspace(false); setError("No offline workspace is available yet."); setLoading(false); } } })();
    const unsubscribe = NetInfo.addEventListener((state) => { const connected = Boolean(state.isConnected && state.isInternetReachable !== false); setOnline(connected); if (connected) void load(); });
    return () => { mounted = false; unsubscribe(); };
  }, [load]);
  useEffect(() => { sheetRef.current = sheet; }, [sheet]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const returningFromBackground = /inactive|background/.test(appStateRef.current) && nextState === "active";
      appStateRef.current = nextState;
      if (!returningFromBackground) return;
      if (sheetRef.current === "task" || sheetRef.current === "subCategory") {
        Keyboard.dismiss();
        setTimeout(() => taskFormScrollRef.current?.scrollTo({ y: 0, animated: false }), 0);
      }
      void load();
    });
    return () => subscription.remove();
  }, [load]);
  const isCompactIPhone = Platform.OS === "ios" && windowWidth < 600;
  const isPlanningWorkspace = !isCompactIPhone && windowWidth >= 760;
  const inspectorPaneVisible = isPlanningWorkspace && inspectorPaneEnabled;
  const scopedTasks = useMemo(() => dashboard ? orderTasks(dashboard.tasks, dashboard.categories).filter((task) => (category === "all" || task.categoryId === category) && taskMatchesPriority(task, priority) && (responsibleColleagueFilter === "all" || (responsibleColleagueFilter === "unassigned" ? taskResponsibleColleagueIds(task).length === 0 : taskResponsibleColleagueIds(task).includes(responsibleColleagueFilter)))) : [], [dashboard, category, priority, responsibleColleagueFilter]);
  const tasks = useMemo(() => completed ? scopedTasks : scopedTasks.filter((task) => !task.done), [completed, scopedTasks]);
  const myDayTasks = useMemo(() => {
    const urgentCategoryIds = new Set((dashboard?.categories ?? []).filter((item) => item.kind === "urgent").map((item) => item.id));
    const priorityRank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
    return scopedTasks.filter((task) => !task.done && (urgentCategoryIds.has(task.categoryId) || isDueToday(task.dueAt))).sort((left, right) => {
      const urgentDifference = Number(urgentCategoryIds.has(right.categoryId)) - Number(urgentCategoryIds.has(left.categoryId));
      if (urgentDifference) return urgentDifference;
      return priorityRank[left.priority] - priorityRank[right.priority] || (left.dueAt ?? Number.MAX_SAFE_INTEGER) - (right.dueAt ?? Number.MAX_SAFE_INTEGER) || left.sortOrder - right.sortOrder;
    });
  }, [dashboard, scopedTasks]);
  const workViewTasks = useMemo(() => {
    if (workView === "all") return tasks;
    if (workView === "myDay") return myDayTasks;
    if (workView === "upcoming") return scopedTasks.filter((task) => !task.done && isDueWithinNextSevenDays(task.dueAt)).sort((left, right) => (left.dueAt ?? Number.MAX_SAFE_INTEGER) - (right.dueAt ?? Number.MAX_SAFE_INTEGER) || left.sortOrder - right.sortOrder);
    if (workView === "high") return scopedTasks.filter((task) => !task.done && task.priority === "high");
    return scopedTasks.filter((task) => !task.done && task.dueAt !== null).sort((left, right) => (left.dueAt ?? Number.MAX_SAFE_INTEGER) - (right.dueAt ?? Number.MAX_SAFE_INTEGER) || left.sortOrder - right.sortOrder);
  }, [myDayTasks, scopedTasks, tasks, workView]);
  const subcategories = useMemo(() => dashboard && reorderParent ? dashboard.tasks.filter((task) => task.parentId === reorderParent.id).sort((left, right) => left.sortOrder - right.sortOrder) : [], [dashboard, reorderParent]);
  const topLevelTasks = useMemo(() => dashboard && reorderCategoryId ? dashboard.tasks.filter((task) => task.categoryId === reorderCategoryId && task.parentId === null).sort((left, right) => left.sortOrder - right.sortOrder) : [], [dashboard, reorderCategoryId]);
  const selectedTasks = useMemo(() => workViewTasks.filter((task) => selectedTaskIds.includes(task.id)), [workViewTasks, selectedTaskIds]);
  const activeCreationSheet = sheet === "selectCategory" || sheet === "selectParent" ? destinationPickerOrigin : sheet;
  const formCategoryId = selectedDestinationCategoryId ?? (activeCreationSheet === "subCategory" ? subCategoryParent?.categoryId ?? null : category === "all" ? dashboard?.categories[0]?.id ?? null : category);
  const formCategory = dashboard?.categories.find((item) => item.id === formCategoryId) ?? null;
  const formParent = selectedParentTaskId !== null ? dashboard?.tasks.find((item) => item.id === selectedParentTaskId) ?? null : subCategoryParent;
  const eligibleParentTasks = useMemo(() => dashboard && formCategoryId ? orderTasks(dashboard.tasks, dashboard.categories).filter((task) => task.categoryId === formCategoryId && task.id > 0) : [], [dashboard, formCategoryId]);
  const focusedTask = useMemo(() => dashboard?.tasks.find((task) => task.id === focusedTaskId) ?? null, [dashboard, focusedTaskId]);
  const topThree = useMemo(() => myDayTasks.slice(0, 3), [myDayTasks]);
  const selectedCategory = category === "all" ? null : dashboard?.categories.find((item) => item.id === category) ?? null;
  const landingCategoryLabel = selectedCategory?.name ?? "All tasks";
  const selectedResponsibleColleague = typeof responsibleColleagueFilter === "number" ? dashboard?.directReports.find((item) => item.id === responsibleColleagueFilter) ?? null : null;
  const responsibleColleagueFilterLabel = responsibleColleagueFilter === "all" ? "All Responsible Colleagues" : responsibleColleagueFilter === "unassigned" ? "N/A" : selectedResponsibleColleague?.name ?? "All Responsible Colleagues";
  const managementSheetHeight = Math.min(Math.max(Math.round(windowHeight * 0.72), 360), 620);
  const newTaskDueDateLabel = newTaskDueAt === null ? "No due date" : new Date(newTaskDueAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const visibleFilterRef = useRef(`${workView}:${category}:${priority}:${responsibleColleagueFilter}:${completed}`);
  useEffect(() => {
    const next = `${workView}:${category}:${priority}:${responsibleColleagueFilter}:${completed}`;
    if (visibleFilterRef.current !== next) {
      visibleFilterRef.current = next;
      setSelectedTaskIds([]);
      setFocusedTaskId(null);
    }
  }, [workView, category, priority, responsibleColleagueFilter, completed]);
  const save = async (task: Task, patch: TaskPatch) => { if (!dashboard) return; const next = applyTaskPatch(dashboard, task.id, patch); setDashboard(next); setHasCachedWorkspace(true); await cacheDashboard(next); await enqueueMutation({ type: "patch", taskId: task.id, patch }); setPending(await queueLength()); if (online) void load(); };
  const closeSheet = () => { setSheet(null); setText(""); setEditingCategory(null); setEditingReport(null); setSubCategoryParent(null); setSelectedDestinationCategoryId(null); setSelectedParentTaskId(null); setNewCategoryName(""); setNewParentTaskName(""); setCreatingNewCategory(false); setCreatingNewParent(false); setDestinationPickerOrigin(null); setReorderParent(null); setReorderCategoryId(null); setMovingTask(null); setNewTaskPriority("medium"); setNewTaskDueAt(null); setNewTaskRecurrence("none"); setNewTaskResponsibleColleagueIds([]); setShowDueDatePicker(false); setEmailTo(""); setEmailCc(""); setEmailSubject(""); setEmailBody(""); setEmailReview(false); };
  const openSheet = (next: Exclude<Sheet, null>) => { haptic(); setText(""); setNewCategoryName(""); setNewParentTaskName(""); setCreatingNewCategory(false); setCreatingNewParent(false); setDestinationPickerOrigin(null); setNewTaskPriority("medium"); setNewTaskDueAt(null); setNewTaskRecurrence("none"); setNewTaskResponsibleColleagueIds([]); setShowDueDatePicker(false); setEmailTo(""); setEmailCc(""); setEmailSubject(""); setEmailBody(""); setEmailReview(false); setSheet(next); };
  const openDestinationPicker = (kind: "category" | "parent") => { if (sheet !== "task" && sheet !== "subCategory") return; Keyboard.dismiss(); haptic(); setDestinationPickerOrigin(sheet); setSheet(kind === "category" ? "selectCategory" : "selectParent"); };
  const returnToDestinationForm = () => { setSheet(destinationPickerOrigin ?? "task"); setDestinationPickerOrigin(null); };
  const chooseNewCategoryDestination = () => {
    setCreatingNewCategory(true);
    setSelectedDestinationCategoryId(null);
    setSelectedParentTaskId(null);
    returnToDestinationForm();
    setTimeout(() => newCategoryInputRef.current?.focus(), 120);
  };
  const ensureOnline = () => { if (online) return true; Alert.alert("Connect to manage", "Shared categories, Responsible Colleagues, and ordering changes are saved when you are online."); return false; };
  const createTask = async (parent: Task | null) => {
    if (!text.trim() || !dashboard || savingEntityRef.current) return;
    savingEntityRef.current = true;
    setSavingEntity(true);
    try {
    let categoryId = selectedDestinationCategoryId ?? parent?.categoryId ?? (category === "all" ? dashboard.categories[0]?.id : category);
    if (!categoryId) { Alert.alert("Add a category first", "Create a category before adding work items."); return; }
    let parentId = sheet === "subCategory" ? (selectedParentTaskId ?? (selectedDestinationCategoryId === null && !newCategoryName.trim() ? parent?.id ?? null : null)) : null;
    const needsNewDestination = Boolean(newCategoryName.trim() || (sheet === "subCategory" && newParentTaskName.trim()));
    if (needsNewDestination && !ensureOnline()) return;
    try {
      if (newCategoryName.trim()) {
        const created = await createCategoryRemote({ name: newCategoryName.trim(), sortOrder: dashboard.categories.length, colorIndex: 0 });
        categoryId = created.id;
        setCategory(created.id);
      }
      if (sheet === "subCategory" && newParentTaskName.trim()) {
        const parentSortOrder = dashboard.tasks.filter((item) => item.categoryId === categoryId && item.parentId === null).length;
        const createdParent = await createTaskRemote({ categoryId, text: newParentTaskName.trim(), sortOrder: parentSortOrder, priority: "medium", mobileClientMutationId: `mobile-parent-${Date.now()}-${Math.random().toString(36).slice(2)}` });
        parentId = createdParent.id;
      }
    } catch (reason) { Alert.alert("Could not create destination", reason instanceof Error ? reason.message : "Please try again."); return; }
    if (parentId && parentId < 0) { Alert.alert("Waiting to sync", "This parent item must finish syncing before you can add a Subtask beneath it."); return; }
    const siblingCount = dashboard.tasks.filter((item) => item.categoryId === categoryId && (item.parentId ?? null) === parentId).length;
    const input: TaskCreateInput = { categoryId, ...(parentId ? { parentId } : {}), text: text.trim(), sortOrder: siblingCount, dueAt: newTaskDueAt, priority: newTaskPriority, recurrence: newTaskRecurrence, responsibleColleagueIds: newTaskResponsibleColleagueIds, mobileClientMutationId: `mobile-create-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    if (needsNewDestination) {
      try { await createTaskRemote(input); closeSheet(); await load(); }
      catch (reason) { Alert.alert("Could not add task", reason instanceof Error ? reason.message : "Please try again."); }
      return;
    }
    const next = addTemporaryTask(dashboard, input); const temporaryTaskId = next.tasks[next.tasks.length - 1].id;
    setDashboard(next); await cacheDashboard(next); await enqueueMutation({ type: "create", temporaryTaskId, input }); setPending(await queueLength()); closeSheet(); if (online) void load();
    } finally {
      savingEntityRef.current = false;
      setSavingEntity(false);
    }
  };
  const saveEntity = async () => {
    if (!text.trim() || !dashboard || !sheet || sheet === "menu") return;
    if (sheet === "task") { await createTask(null); return; }
    if (sheet === "subCategory") { await createTask(subCategoryParent); return; }
    if (!ensureOnline() || savingEntityRef.current) return;
    savingEntityRef.current = true;
    setSavingEntity(true);
    try {
      if (sheet === "category") {
        if (editingCategory) await updateCategoryRemote({ id: editingCategory.id, name: text.trim(), colorIndex: categoryColourIndex });
        else { const created = await createCategoryRemote({ name: text.trim(), sortOrder: dashboard.categories.length, colorIndex: categoryColourIndex }); setCategory(created.id); }
      }
      if (sheet === "directReport") {
        if (editingReport) await updateDirectReportRemote({ id: editingReport.id, name: text.trim() });
        else await createDirectReportRemote({ name: text.trim(), sortOrder: dashboard.directReports.length });
      }
      closeSheet(); await load();
    } catch (reason) { Alert.alert("Could not save", reason instanceof Error ? reason.message : "Please try again."); }
    finally { savingEntityRef.current = false; setSavingEntity(false); }
  };
  const editCategory = (item: Category) => { setEditingCategory(item); setText(item.name); setCategoryColourIndex(item.colorIndex); setSheet("category"); };
  const editReport = (item: DirectReport) => { setEditingReport(item); setText(item.name); setSheet("directReport"); };
  const deleteCategory = (item: Category) => {
    const containedCount = dashboard?.tasks.filter((task) => task.categoryId === item.id).length ?? 0;
    const detail = containedCount ? `“${item.name}” contains ${containedCount} task${containedCount === 1 ? "" : "s"}, including any nested sub-categories. Delete the category and all of them?` : `Delete the empty category “${item.name}”?`;
    Alert.alert("Delete category and its tasks?", detail, [{ text: "Keep category", style: "cancel" }, { text: containedCount ? "Delete all" : "Delete category", style: "destructive", onPress: () => void (async () => {
      if (!dashboard || !ensureOnline()) return;
      const beforeDelete = dashboard;
      const wasSelectedCategory = category === item.id;
      const optimistic = { ...dashboard, categories: dashboard.categories.filter((entry) => entry.id !== item.id), tasks: dashboard.tasks.filter((task) => task.categoryId !== item.id), syncedAt: Date.now() };
      setDashboard(optimistic);
      await cacheDashboard(optimistic);
      if (wasSelectedCategory) setCategory("all");
      try {
        await deleteCategoryRemote(item.id);
        const refreshed = await getDashboard();
        if (refreshed.categories.some((entry) => entry.id === item.id)) throw new Error("The shared dashboard did not confirm that this category was removed.");
        setDashboard(refreshed);
        await cacheDashboard(refreshed);
      } catch (reason) {
        setDashboard(beforeDelete);
        await cacheDashboard(beforeDelete);
        if (wasSelectedCategory) setCategory(item.id);
        Alert.alert("Could not delete category", reason instanceof Error ? reason.message : "The category was not removed. Please try again.");
      }
    })() }]);
  };
  const deleteReport = (item: DirectReport) => Alert.alert("Delete Responsible Colleague?", `${item.name} will be removed from assigned tasks. Tasks with no remaining Responsible Colleagues will become N/A.`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => void (async () => { if (!ensureOnline()) return; await deleteDirectReportRemote(item.id); await load(); })() }]);
  const persistCategoryOrder = async (data: Category[]) => { if (!ensureOnline()) return; try { await reorderCategoriesRemote(data.map((item, sortOrder) => ({ id: item.id, sortOrder }))); await load(); } catch { Alert.alert("Could not reorder", "Please try again."); } };
  const moveCategory = (categoryId: number, direction: -1 | 1) => {
    if (!dashboard) return;
    const ordered = [...dashboard.categories].sort((left, right) => left.sortOrder - right.sortOrder);
    const index = ordered.findIndex((item) => item.id === categoryId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
    const next = [...ordered];
    [next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!];
    void persistCategoryOrder(next);
  };
  const persistSubcategoryOrder = async (data: Task[]) => { if (!ensureOnline() || !reorderParent) return; try { await reorderTasksRemote(data.map((item, sortOrder) => ({ id: item.id, sortOrder, parentId: reorderParent.id, categoryId: reorderParent.categoryId }))); await load(); } catch { Alert.alert("Could not reorder", "Please try again."); } };
  const persistTaskOrder = async (data: Task[]) => { if (!ensureOnline() || !reorderCategoryId) return; try { await reorderTasksRemote(data.map((item, sortOrder) => ({ id: item.id, sortOrder, parentId: null, categoryId: reorderCategoryId }))); await load(); } catch { Alert.alert("Could not reorder", "Please try again."); } };
  const moveTask = async (destination: TaskMoveDestination) => { if (!dashboard || !movingTask || !ensureOnline()) return; const updates = buildTaskMoveUpdates(dashboard.tasks, movingTask.id, destination); if (!updates.length) { Alert.alert("Move unavailable", "Choose a category or parent that does not create a nested cycle."); return; } try { await reorderTasksRemote(updates); closeSheet(); await load(); } catch { Alert.alert("Could not move task", "Please try again."); } };
  const toggleTaskSelection = (taskId: number) => setSelectedTaskIds((current) => current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]);
  const endSelection = () => { setSelectionMode(false); setSelectedTaskIds([]); };
  const moveSelectedTasks = async (destination: TaskMoveDestination) => { if (!dashboard || !selectedTaskIds.length || !ensureOnline()) return; const updates = buildBulkTaskMoveUpdates(dashboard.tasks, selectedTaskIds, destination); if (!updates.length) { Alert.alert("Move unavailable", "Choose a category or parent that does not create a nested cycle."); return; } try { await reorderTasksRemote(updates); closeSheet(); endSelection(); await load(); } catch { Alert.alert("Could not move tasks", "Please try again."); } };
  const taskDeletionRoots = (taskIds: number[]) => {
    if (!dashboard) return [];
    const selected = new Set(taskIds);
    const byId = new Map(dashboard.tasks.map((task) => [task.id, task]));
    return taskIds.filter((taskId) => {
      let parentId = byId.get(taskId)?.parentId ?? null;
      while (parentId !== null) {
        if (selected.has(parentId)) return false;
        parentId = byId.get(parentId)?.parentId ?? null;
      }
      return true;
    });
  };
  const requestDeleteTasks = (taskIds: number[]) => {
    if (!dashboard || !taskIds.length) return;
    const roots = taskDeletionRoots(taskIds);
    if (!roots.length) return;
    if (roots.some((id) => id < 0)) { Alert.alert("Waiting to sync", "This task must finish syncing before it can be deleted."); return; }
    const descendants = new Set<number>();
    const visit = (taskId: number) => dashboard.tasks.filter((task) => task.parentId === taskId).forEach((child) => { descendants.add(child.id); visit(child.id); });
    roots.forEach(visit);
    const rootCount = roots.length;
    const totalCount = rootCount + descendants.size;
    const title = rootCount === 1 ? "Delete task?" : "Delete selected tasks?";
    const message = descendants.size ? `This will permanently delete ${totalCount} items: ${rootCount} selected task${rootCount === 1 ? "" : "s"} and ${descendants.size} nested sub-categor${descendants.size === 1 ? "y" : "ies"}.` : `Permanently delete ${rootCount} selected task${rootCount === 1 ? "" : "s"}?`;
    Alert.alert(title, message, [{ text: "Keep tasks", style: "cancel" }, { text: rootCount === 1 ? "Delete task" : "Delete all", style: "destructive", onPress: () => void (async () => { if (!ensureOnline()) return; try { for (const taskId of roots) await deleteTaskRemote(taskId); endSelection(); await load(); } catch { Alert.alert("Could not delete tasks", "Please try again."); } })() }]);
  };
  const toggleReminders = async () => { const result = await configurePushReminders(!reminders); setReminders(result.enabled); Alert.alert("Task reminders", result.message); };
  const emailRecipients = (value: string) => value.split(/[;,]/).map((entry) => entry.trim()).filter(Boolean);
  const reviewEmail = () => {
    if (!emailRecipients(emailTo).length || !emailSubject.trim() || !emailBody.trim()) { Alert.alert("Complete the email", "Add at least one recipient, a subject, and a message before reviewing."); return; }
    Keyboard.dismiss();
    setEmailReview(true);
  };
  const handOffEmailToClient = async () => {
    const to = emailRecipients(emailTo);
    const cc = emailRecipients(emailCc);
    const query = [`subject=${encodeURIComponent(emailSubject)}`, `body=${encodeURIComponent(emailBody)}`, ...(cc.length ? [`cc=${encodeURIComponent(cc.join(","))}`] : [])].join("&");
    const url = `mailto:${encodeURIComponent(to.join(","))}?${query}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) throw new Error("No email app is configured on this device.");
      await Linking.openURL(url);
      closeSheet();
      Alert.alert("Email ready to send", "Your email app has opened with the reviewed message. Send it there when you are ready.");
    } catch (reason) { Alert.alert("Could not open email", reason instanceof Error ? reason.message : "Configure an email app, then try again."); }
  };
  const formTitle = sheet === "category" ? (editingCategory ? "Edit category" : "Add category") : sheet === "directReport" ? (editingReport ? "Edit Responsible Colleague" : "Add Responsible Colleague") : sheet === "subCategory" ? "Add Subtask" : "Add task";
  const formPlaceholder = sheet === "category" ? "Category name" : sheet === "directReport" ? "Responsible Colleague name" : sheet === "subCategory" ? "Subtask name" : "What needs doing?";
  const isTaskFormSheet = sheet === "task" || sheet === "subCategory";
  const selectedWorkView = workViewOptions.find((item) => item.id === workView)!;
  const canReorderWorkspaceTasks = workView === "all" && category !== "all";
  const calendarAgenda = useMemo(() => {
    const groups = new Map<string, { dueAt: number; tasks: OrderedTask[] }>();
    for (const task of workViewTasks) {
      if (task.dueAt === null) continue;
      const date = new Date(task.dueAt);
      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const group = groups.get(dateKey) ?? { dueAt: task.dueAt, tasks: [] };
      group.tasks.push(task);
      groups.set(dateKey, group);
    }
    return [...groups.values()].sort((left, right) => left.dueAt - right.dueAt);
  }, [workViewTasks]);
  const renderTask = (item: OrderedTask, { inspectorMode = false, inlineDetailsEnabled = true, canFocus = true, focusOnPriority = false }: { inspectorMode?: boolean; inlineDetailsEnabled?: boolean; canFocus?: boolean; focusOnPriority?: boolean } = {}) => <TaskRow task={item} category={dashboard?.categories.find((entry) => entry.id === item.categoryId)} directReports={dashboard?.directReports ?? []} save={(patch) => save(item, patch)} onCreateSubcategory={(parent) => { setSubCategoryParent(parent); openSheet("subCategory"); }} onReorderSubcategories={(parent) => { setReorderParent(parent); setSheet("reorderSubcategories"); }} onMoveTask={(task) => { setMovingTask(task); setSheet("moveTask"); }} onDeleteTask={(task) => requestDeleteTasks([task.id])} selectionMode={selectionMode} selected={selectedTaskIds.includes(item.id)} onToggleSelection={toggleTaskSelection} focused={canFocus && focusedTaskId === item.id} onFocus={canFocus ? (task) => setFocusedTaskId(task.id) : undefined} inspectorMode={inspectorMode} inlineDetailsEnabled={inlineDetailsEnabled} focusOnPriority={focusOnPriority} />;
  const setTaskFilter = (nextPriority: "all" | Priority) => { setPriority(nextPriority); endSelection(); };
  const setCategoryScope = (nextCategory: number | "all") => { setCategory(nextCategory); endSelection(); setFocusedTaskId(null); };
  const chooseWorkView = (nextWorkView: WorkView) => { haptic(); setWorkView(nextWorkView); endSelection(); setFocusedTaskId(null); if (!isPlanningWorkspace) closeSheet(); };
  const toggleInspectorPane = () => { haptic(); setInspectorPaneEnabled((enabled) => !enabled); setFocusedTaskId(null); };
  if (loading) return <SafeAreaView style={styles.center}><StatusBar style="dark" /><ActivityIndicator color="#155E4A" /><Text style={styles.loading}>Loading your workspace…</Text></SafeAreaView>;
  return <GestureHandlerRootView style={styles.gestureRoot}><SafeAreaView style={styles.screen}><StatusBar style="dark" />
    <View style={styles.header}>
      <Text numberOfLines={1} style={styles.eyebrow}>STEPHEN’S WORKSPACE</Text>
      <View style={[styles.headerMainRow, isCompactIPhone && styles.headerMainRowCompact]}>
        <View style={styles.headerCopy}>
          <Text numberOfLines={1} style={styles.heading}>{isPlanningWorkspace ? "Plan" : selectedWorkView.label}</Text>
          <Text style={styles.headerSubheading}>{isPlanningWorkspace ? (inspectorPaneVisible ? "Organise work with a clear task inspector" : "Organise work with focused inline task details") : selectedWorkView.hint}</Text>
        </View>
        <View style={[styles.headerActions, isCompactIPhone && styles.headerActionsCompact]}>
          <Pressable accessibilityRole="button" accessibilityLabel={selectionMode ? "Finish selecting tasks" : "Select multiple tasks"} onPress={() => selectionMode ? endSelection() : setSelectionMode(true)} style={[styles.headerAction, isCompactIPhone && styles.headerActionCompact]}><Text numberOfLines={1} style={styles.headerActionText}>{selectionMode ? "Done" : "Select"}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="More workspace actions" onPress={() => openSheet("menu")} style={[styles.headerSecondaryAction, isCompactIPhone && styles.headerActionCompact]}><Text numberOfLines={1} style={styles.headerSecondaryActionText}>More</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Add item" onPress={() => openSheet("menu")} style={[styles.headerAction, isCompactIPhone && styles.headerActionCompact]}><Text numberOfLines={1} style={styles.headerActionText}>＋ Add Task</Text></Pressable>
        </View>
      </View>
    </View>
    <View style={styles.syncBar}><Text style={styles.syncText}>{online ? (pending ? `${pending} queued change${pending === 1 ? "" : "s"} syncing` : "Synced") : (hasCachedWorkspace ? `${pending ? `${pending} change${pending === 1 ? "" : "s"} queued` : "Offline — cached workspace"}` : "Offline — no workspace yet")}</Text></View>
    {error && !dashboard ? <View style={styles.offlineRecovery}><Text style={styles.emptyTitle}>{online ? "Workspace unavailable" : "No offline workspace yet"}</Text><Text style={styles.meta}>{online ? error : "Connect once to load your shared workspace. Once it is loaded, tasks and queued changes remain available offline."}</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry loading workspace" onPress={() => void load()} style={styles.save}><Text style={styles.saveText}>Try again</Text></Pressable></View> : <>
      {isPlanningWorkspace ? <View style={styles.workspace}>
        <ScrollView style={styles.workspaceNav} contentContainerStyle={styles.workspaceNavContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          <Text style={styles.workspaceLabel}>WORK VIEWS</Text>
          {workViewOptions.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Select Work View ${item.label}`} accessibilityHint={item.hint} accessibilityState={{ selected: workView === item.id }} onPress={() => chooseWorkView(item.id)} style={[styles.workspaceWorkView, workView === item.id && styles.workspaceWorkViewOn]}><Text numberOfLines={1} style={[styles.workspaceWorkViewText, workView === item.id && styles.workspaceWorkViewTextOn]}>{item.label}</Text><Text style={styles.workspaceWorkViewCheck}>{workView === item.id ? "✓" : ""}</Text></Pressable>)}
          <View style={styles.workspaceNavDivider} />
          <Text style={styles.workspaceLabel}>CATEGORY SCOPE</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Filter by All tasks" onPress={() => setCategoryScope("all")} style={[styles.workspaceNavItem, category === "all" && styles.workspaceNavItemOn]}><Text style={[styles.workspaceNavText, category === "all" && styles.workspaceNavTextOn]}>All tasks</Text></Pressable>
          {(dashboard?.categories ?? []).map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Filter by ${item.name}`} onPress={() => setCategoryScope(item.id)} style={[styles.workspaceNavItem, category === item.id && styles.workspaceNavItemOn]}><View style={[styles.categoryDot, { backgroundColor: categoryColour(item.colorIndex) }]} /><Text numberOfLines={1} style={[styles.workspaceNavText, category === item.id && styles.workspaceNavTextOn]}>{item.name}</Text></Pressable>)}
          <View style={styles.workspaceNavFooter}><Pressable accessibilityRole="button" accessibilityLabel="Manage and reorder categories" onPress={() => setSheet("manageCategories")} style={styles.workspaceNavAction}><Text style={styles.workspaceNavActionText}>Manage categories</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Open task filters" onPress={() => setSheet("filters")} style={styles.workspaceNavAction}><Text style={styles.workspaceNavActionText}>Filters & settings</Text></Pressable></View>
        </ScrollView>
        <View style={styles.workspaceList}>
          <View style={styles.workspaceListHeader}>
            <View style={styles.workspaceListHeaderCopy}><Text style={styles.workspaceListTitle}>{selectedWorkView.label}</Text><Text style={styles.modalHint}>{landingCategoryLabel} · {workViewTasks.length} visible task{workViewTasks.length === 1 ? "" : "s"}</Text></View>
            <View style={styles.workspaceListActions}>
              <Pressable accessibilityRole="switch" accessibilityState={{ checked: inspectorPaneVisible }} accessibilityLabel={inspectorPaneVisible ? "Task preview is on. Hide task preview pane" : "Task preview is off. Show task preview pane"} onPress={toggleInspectorPane} style={[styles.workspacePreviewToggle, inspectorPaneVisible && styles.workspacePreviewToggleOn]}><Text style={styles.workspacePreviewToggleText}>Preview {inspectorPaneVisible ? "on" : "off"}</Text></Pressable>
              {canReorderWorkspaceTasks ? <Pressable accessibilityRole="button" accessibilityLabel="Reorder tasks in current category" onPress={() => { setReorderCategoryId(category); setSheet("reorderTasks"); }} style={styles.workspaceOrderButton}><Text style={styles.workspaceOrderText}>Order</Text></Pressable> : <View accessibilityLabel="Task ordering availability" style={styles.workspaceOrderUnavailable}><Text style={styles.workspaceOrderUnavailableText}>Order is available in All tasks when a category is selected.</Text></View>}
            </View>
          </View>
          {selectionMode && <View style={styles.bulkBar}><Text style={styles.bulkText}>{selectedTaskIds.length} selected</Text><Pressable accessibilityRole="button" accessibilityLabel="Move selected tasks" disabled={!selectedTaskIds.length} onPress={() => setSheet("bulkMove")} style={[styles.bulkMove, !selectedTaskIds.length && styles.bulkMoveDisabled]}><Text style={styles.bulkMoveText}>Move</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Delete selected tasks" disabled={!selectedTaskIds.length} onPress={() => requestDeleteTasks(selectedTaskIds)} style={[styles.bulkDelete, !selectedTaskIds.length && styles.bulkMoveDisabled]}><Text style={styles.bulkDeleteText}>Delete</Text></Pressable></View>}
          {workView === "calendar" ? <FlatList key={`workspace-calendar-${inspectorPaneVisible ? "preview" : "inline"}`} data={calendarAgenda.flatMap((group) => [{ type: "agenda" as const, dueAt: group.dueAt }, ...group.tasks.map((task) => ({ type: "task" as const, task }))])} keyExtractor={(item) => item.type === "agenda" ? `agenda-${item.dueAt}` : `task-${item.task.id}`} contentContainerStyle={styles.workspaceTaskList} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#155E4A" />} renderItem={({ item }) => item.type === "agenda" ? <Text accessibilityRole="header" style={styles.agendaDate}>{agendaDateLabel(item.dueAt)}</Text> : renderTask(item.task, { inlineDetailsEnabled: !inspectorPaneVisible, canFocus: inspectorPaneVisible, focusOnPriority: inspectorPaneVisible })} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>No scheduled tasks</Text><Text style={styles.meta}>Add due dates to unfinished tasks to see them in your agenda.</Text></View>} /> : <FlatList key={`workspace-${workView}-${inspectorPaneVisible ? "preview" : "inline"}`} data={workViewTasks} keyExtractor={(task) => String(task.id)} contentContainerStyle={styles.workspaceTaskList} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#155E4A" />} renderItem={({ item }) => renderTask(item, { inlineDetailsEnabled: !inspectorPaneVisible, canFocus: inspectorPaneVisible, focusOnPriority: inspectorPaneVisible })} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>No matching tasks</Text><Text style={styles.meta}>{workView === "myDay" ? "Nothing is urgent or due today." : "Adjust filters or add your next task."}</Text></View>} />}
        </View>
        {inspectorPaneVisible && <View style={styles.inspector}><Text style={styles.workspaceLabel}>TASK INSPECTOR</Text>{focusedTask ? renderTask({ ...focusedTask, hierarchyDepth: 0, parentTaskText: null }, { inspectorMode: true }) : <View style={styles.inspectorEmpty}><Text style={styles.emptyTitle}>Select a task</Text><Text style={styles.meta}>Choose a task in the list to review its details, schedule, people, and notes.</Text></View>}</View>}
      </View> : <>
        <View style={styles.workViewBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose Work View" accessibilityState={{ expanded: sheet === "selectWorkView" }} onPress={() => setSheet("selectWorkView")} style={styles.workViewPicker}><View style={styles.workViewPickerCopy}><Text style={styles.sectionKicker}>WORK VIEW</Text><Text numberOfLines={1} style={styles.workViewPickerText}>{selectedWorkView.label}</Text></View><Text style={styles.categoryPickerArrow}>⌄</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Open task filters" onPress={() => setSheet("filters")} style={styles.filterButton}><Text style={styles.filterButtonText}>Filter</Text></Pressable>
        </View>
        {workView === "myDay" && <><View style={styles.todaySummary}>
          <View style={styles.focusSummaryCopy}>
            <Text style={styles.sectionKicker}>FOCUS</Text>
            <Text style={styles.todaySummaryTitle}>Top 3</Text>
            <Text style={styles.modalHint}>Urgent or due today</Text>
          </View>
          <View style={styles.todaySummaryActions}>
            <Pressable accessibilityRole="button" accessibilityLabel={topThreeExpanded ? "Collapse Top 3 focus" : `Expand Top 3 focus, ${topThree.length} tasks`} accessibilityState={{ expanded: topThreeExpanded }} onPress={() => setTopThreeExpanded((expanded) => !expanded)} style={styles.topThreeDisclosure}>
              <Text numberOfLines={1} style={styles.topThreeDisclosureText}>{topThreeExpanded ? "Top 3" : `${topThree.length} focus task${topThree.length === 1 ? "" : "s"}`}</Text>
              <Text style={styles.topThreeDisclosureChevron}>{topThreeExpanded ? "⌃" : "⌄"}</Text>
            </Pressable>
          </View>
        </View>
        {topThreeExpanded && <View style={styles.topThree}>{topThree.length ? topThree.map((task, index) => <Pressable key={task.id} accessibilityRole="button" accessibilityLabel={`Focus task ${task.text}`} onPress={() => { setFocusedTaskId(task.id); setCategoryScope(task.categoryId); }} style={styles.topThreeRow}><Text style={styles.topThreeNumber}>{index + 1}</Text><View style={styles.topThreeCopy}><Text numberOfLines={1} style={styles.topThreeTitle}>{task.text}</Text><Text style={styles.meta}>{dueText(task.dueAt)} · {task.priority}</Text></View><Text style={[styles.topThreePriority, { color: priorityColor(task.priority) }]}>{task.priority}</Text></Pressable>) : <Text style={styles.modalHint}>Nothing urgent or due today. Add a task when you are ready.</Text>}</View>}</>}
        {workView !== "myDay" && <View style={styles.workViewSummary}><Text style={styles.workViewSummaryTitle}>{selectedWorkView.label}</Text><Text style={styles.modalHint}>{selectedWorkView.hint}</Text></View>}
        <View style={styles.phonePlanBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose task-list category" onPress={() => setSheet("selectLandingCategory")} style={styles.categoryPicker}><View style={[styles.categoryDot, { backgroundColor: selectedCategory ? categoryColour(selectedCategory.colorIndex) : "#155E4A" }]} /><Text numberOfLines={1} style={styles.categoryPickerText}>{landingCategoryLabel}</Text><Text style={styles.categoryPickerArrow}>⌄</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={taskControlsVisible ? "Hide task controls" : "Show task controls"} onPress={() => setTaskControlsVisible((visible) => !visible)} style={styles.planButton}><Text style={styles.planButtonText}>{taskControlsVisible ? "Plan" : "Show plan"}</Text></Pressable>
        </View>
        {taskControlsVisible && <View style={styles.phoneFilterSummary}><Text style={styles.modalHint}>Priority: {priority === "all" ? "All" : priority} · {responsibleColleagueFilterLabel}</Text></View>}
        {selectionMode && <View style={styles.bulkBar}><Text style={styles.bulkText}>{selectedTaskIds.length} selected</Text><Pressable accessibilityRole="button" accessibilityLabel="Move selected tasks" disabled={!selectedTaskIds.length} onPress={() => setSheet("bulkMove")} style={[styles.bulkMove, !selectedTaskIds.length && styles.bulkMoveDisabled]}><Text style={styles.bulkMoveText}>Move</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Delete selected tasks" disabled={!selectedTaskIds.length} onPress={() => requestDeleteTasks(selectedTaskIds)} style={[styles.bulkDelete, !selectedTaskIds.length && styles.bulkMoveDisabled]}><Text style={styles.bulkDeleteText}>Delete</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Clear selected tasks" onPress={() => setSelectedTaskIds([])}><Text style={styles.bulkClear}>Clear</Text></Pressable></View>}
        {workView === "calendar" ? <FlatList data={calendarAgenda} keyExtractor={(group) => String(group.dueAt)} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#155E4A" />} renderItem={({ item }) => <View style={styles.agendaGroup}><Text accessibilityRole="header" style={styles.agendaDate}>{agendaDateLabel(item.dueAt)}</Text>{item.tasks.map((task) => <React.Fragment key={task.id}>{renderTask(task)}</React.Fragment>)}</View>} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>No scheduled tasks</Text><Text style={styles.meta}>Add due dates to unfinished tasks to see them in your agenda.</Text></View>} /> : <FlatList data={workViewTasks} keyExtractor={(task) => String(task.id)} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#155E4A" />} renderItem={({ item }) => renderTask(item)} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>No matching tasks</Text><Text style={styles.meta}>{workView === "myDay" ? "Nothing is urgent or due today." : "Adjust a filter or add your next task."}</Text></View>} />}
      </>}
    </>}
    <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={closeSheet}><View style={styles.backdrop}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={8} style={styles.keyboardAvoider}>{sheet === "manageCategories" ? <CategoryManagerSheet categories={dashboard?.categories ?? []} height={managementSheetHeight} onMove={moveCategory} onEdit={editCategory} onDelete={deleteCategory} onDone={closeSheet} /> : <ScrollView ref={isTaskFormSheet ? taskFormScrollRef : undefined} style={[styles.modalScroll, isTaskFormSheet && styles.taskSetupScroll]} contentContainerStyle={[styles.modalScrollContent, isTaskFormSheet && styles.taskSetupScrollContent]} scrollEnabled={sheet !== "selectCategory" && sheet !== "selectParent" && sheet !== "selectLandingCategory" && sheet !== "selectWorkView"} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={isTaskFormSheet}><View style={[styles.modal, isTaskFormSheet && styles.taskSetupModal]}>
      {sheet === "menu" ? <><Text style={styles.modalTitle}>More</Text><Text style={styles.modalHint}>Add work or manage your workspace without crowding Today.</Text><Pressable accessibilityRole="switch" accessibilityState={{ checked: reminders }} accessibilityLabel={`Task reminders are ${reminders ? "on" : "off"}. ${reminders ? "Turn reminders off" : "Turn reminders on"}`} onPress={() => void toggleReminders()} style={[styles.menuAction, reminders && styles.reminderToggleOn]}><Text style={styles.menuActionTitle}>Task reminders</Text><Text style={styles.menuActionHint}>Currently {reminders ? "on" : "off"}. Tap to turn reminders {reminders ? "off" : "on"}.</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Add task" onPress={() => openSheet("task")} style={styles.menuAction}><Text style={styles.menuActionTitle}>Add Task</Text><Text style={styles.menuActionHint}>Capture a work item in the selected category.</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Compose corporate email" onPress={() => openSheet("emailComposer")} style={styles.menuAction}><Text style={styles.menuActionTitle}>Compose email</Text><Text style={styles.menuActionHint}>Review a message, then open your corporate email app to send it.</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Add category" onPress={() => { setCategoryColourIndex(0); openSheet("category"); }} style={styles.menuAction}><Text style={styles.menuActionTitle}>Category</Text><Text style={styles.menuActionHint}>Create a new planning category.</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Add Responsible Colleague" onPress={() => openSheet("directReport")} style={styles.menuAction}><Text style={styles.menuActionTitle}>Responsible Colleague</Text><Text style={styles.menuActionHint}>Add a person accountable for work items.</Text></Pressable>{category !== "all" && (!isPlanningWorkspace || workView === "all") && <Pressable accessibilityRole="button" accessibilityLabel="Reorder tasks in current category" onPress={() => { setReorderCategoryId(category); setSheet("reorderTasks"); }} style={styles.menuAction}><Text style={styles.menuActionTitle}>Reorder tasks</Text><Text style={styles.menuActionHint}>Change the order in {selectedCategory?.name ?? "this category"}.</Text></Pressable>}<Pressable accessibilityRole="button" accessibilityLabel="Manage categories" onPress={() => setSheet("manageCategories")} style={styles.menuAction}><Text style={styles.menuActionTitle}>Manage categories</Text><Text style={styles.menuActionHint}>Rename, colour, delete, or reorder.</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Manage Responsible Colleagues" onPress={() => setSheet("manageReports")} style={styles.menuAction}><Text style={styles.menuActionTitle}>Manage Responsible Colleagues</Text><Text style={styles.menuActionHint}>Rename or delete your accountability list.</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Close add menu" onPress={closeSheet}><Text style={styles.cancel}>Cancel</Text></Pressable></> : null}
      {sheet === "filters" ? <><View style={styles.pickerHeader}><View style={styles.reorderHeaderCopy}><Text style={styles.modalTitle}>Focus & plan</Text><Text style={styles.modalHint}>Refine the work you see. Changing a filter clears bulk selection so selection never implies completion.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close task filters" onPress={closeSheet} style={styles.finishReorder}><Text style={styles.finishReorderText}>Done</Text></Pressable></View><Text style={styles.label}>Priority</Text><View style={styles.detailChips}>{priorities.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: priority === item }} accessibilityLabel={`Filter priority ${item}`} onPress={() => { setTaskFilter(item); closeSheet(); }} style={[styles.chip, priority === item && styles.chipOn]}><Text style={styles.chipText}>{item}</Text></Pressable>)}</View><Text style={styles.label}>Responsible Colleague</Text><Pressable accessibilityRole="button" accessibilityLabel="Choose Responsible Colleague task filter" onPress={() => setSheet("selectLandingResponsibleColleague")} style={styles.destinationPicker}><Text numberOfLines={1} style={styles.destinationPickerText}>{responsibleColleagueFilterLabel}</Text><Text style={styles.destinationChevron}>›</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={completed ? "Hide completed tasks" : "Show completed tasks"} onPress={() => setCompleted(!completed)} style={styles.menuAction}><Text style={styles.menuActionTitle}>{completed ? "Hide completed tasks" : "Show completed tasks"}</Text><Text style={styles.menuActionHint}>Completed work is currently {completed ? "included" : "hidden"}.</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Manage and reorder categories" onPress={() => setSheet("manageCategories")} style={styles.menuAction}><Text style={styles.menuActionTitle}>Manage categories</Text><Text style={styles.menuActionHint}>Reorder, rename, recolour, or delete categories.</Text></Pressable></> : null}
      {sheet === "selectWorkView" ? <><View style={styles.pickerHeader}><View style={styles.reorderHeaderCopy}><Text style={styles.modalTitle}>Work Views</Text><Text style={styles.modalHint}>Choose how you want to see your work. Your category and task filters stay applied.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close Work View picker" onPress={closeSheet} style={styles.finishReorder}><Text style={styles.finishReorderText}>Done</Text></Pressable></View><ScrollView nestedScrollEnabled style={styles.pickerScroll} contentContainerStyle={styles.pickerContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>{workViewOptions.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: workView === item.id }} accessibilityLabel={`Select Work View ${item.label}`} onPress={() => chooseWorkView(item.id)} style={[styles.workViewOption, workView === item.id && styles.workViewOptionOn]}><View style={styles.workViewOptionCopy}><Text style={[styles.workViewOptionTitle, workView === item.id && styles.workViewOptionTitleOn]}>{item.label}</Text><Text style={styles.workViewOptionHint}>{item.hint}</Text></View><Text style={styles.workViewOptionCheck}>{workView === item.id ? "✓" : ""}</Text></Pressable>)}</ScrollView></> : null}
      {sheet === "emailComposer" ? <><Text style={styles.modalTitle}>Compose email</Text><Text style={styles.modalHint}>Your message stays on this device until you confirm opening your email app. You will press Send in your email app.</Text><TextInput autoFocus value={emailTo} onChangeText={setEmailTo} keyboardType="email-address" autoCapitalize="none" placeholder="To: name@company.com; another@company.com" accessibilityLabel="Corporate email recipients" style={styles.input} /><TextInput value={emailCc} onChangeText={setEmailCc} keyboardType="email-address" autoCapitalize="none" placeholder="Cc (optional)" accessibilityLabel="Corporate email cc recipients" style={styles.input} /><TextInput value={emailSubject} onChangeText={setEmailSubject} placeholder="Subject" accessibilityLabel="Corporate email subject" style={styles.input} /><TextInput value={emailBody} onChangeText={setEmailBody} placeholder="Message" multiline textAlignVertical="top" accessibilityLabel="Corporate email message" style={[styles.notes, styles.emailMessage]} />{emailReview ? <View accessibilityLabel="Corporate email review" style={styles.emailReview}><Text style={styles.label}>Review before opening email app</Text><Text style={styles.emailReviewText}>To: {emailRecipients(emailTo).join(", ")}</Text>{emailRecipients(emailCc).length > 0 && <Text style={styles.emailReviewText}>Cc: {emailRecipients(emailCc).join(", ")}</Text>}<Text style={styles.emailReviewText}>Subject: {emailSubject}</Text><Text style={styles.emailReviewBody}>{emailBody}</Text><View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel="Edit corporate email" onPress={() => setEmailReview(false)}><Text style={styles.cancel}>Edit</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Open email app to send" onPress={() => void handOffEmailToClient()} style={styles.save}><Text style={styles.saveText}>Open email app</Text></Pressable></View></View> : <View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel="Cancel corporate email" onPress={closeSheet}><Text style={styles.cancel}>Cancel</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Review corporate email" onPress={reviewEmail} style={styles.save}><Text style={styles.saveText}>Review email</Text></Pressable></View>}</> : null}
      {sheet === "category" || sheet === "directReport" || sheet === "task" || sheet === "subCategory" ? <><Text style={styles.modalTitle}>{formTitle}</Text>
        {(sheet === "task" || sheet === "subCategory") && <View style={styles.destinationSection}>
          <Text style={styles.label}>Category</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose task category" onPress={() => openDestinationPicker("category")} style={styles.destinationPicker}><View style={[styles.managementColour, { backgroundColor: creatingNewCategory ? "#257863" : formCategory ? categoryColour(formCategory.colorIndex) : "#AAB5B0" }]} /><Text numberOfLines={1} style={styles.destinationPickerText}>{creatingNewCategory ? "New category" : formCategory?.name ?? "Choose a category"}</Text><Text style={styles.destinationChevron}>›</Text></Pressable>
          {creatingNewCategory && <TextInput ref={newCategoryInputRef} autoFocus value={newCategoryName} onChangeText={setNewCategoryName} placeholder="New category name" accessibilityLabel="New category for task" style={styles.destinationInput} />}
        </View>}
        {sheet === "subCategory" && <View style={styles.destinationSection}>
          <Text style={styles.label}>Parent task</Text><Text style={styles.modalHint}>Choose where this Subtask will sit, or create a new parent task.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose parent task for Subtask" onPress={() => openDestinationPicker("parent")} style={styles.destinationPicker}><Text numberOfLines={1} style={styles.destinationPickerText}>{creatingNewParent ? "New parent task" : formParent?.text ?? "Choose a parent task"}</Text><Text style={styles.destinationChevron}>›</Text></Pressable>
          {creatingNewParent && <TextInput value={newParentTaskName} onChangeText={setNewParentTaskName} placeholder="New parent task name" accessibilityLabel="New parent task" style={styles.destinationInput} />}
        </View>}
        {sheet === "category" && <View style={styles.palette}>{categoryColours.map((colour, colorIndex) => <Pressable key={colour} accessibilityRole="button" accessibilityLabel={`Select category colour ${colorIndex + 1}`} onPress={() => setCategoryColourIndex(colorIndex)} style={[styles.paletteColour, { backgroundColor: colour }, categoryColourIndex === colorIndex && styles.paletteColourSelected]}><Text style={styles.paletteCheck}>{categoryColourIndex === colorIndex ? "✓" : ""}</Text></Pressable>)}</View>}
        <TextInput autoFocus={!creatingNewCategory} value={text} onChangeText={setText} onSubmitEditing={() => void saveEntity()} returnKeyType="done" placeholder={formPlaceholder} accessibilityLabel={formTitle} style={styles.input} />
        {(sheet === "task" || sheet === "subCategory") && <View style={styles.taskSetup}>
          <Text style={styles.label}>Set up task</Text>
          <View style={styles.taskSetupSection}><Text style={styles.label}>Priority</Text><View style={styles.detailChips}>{(["high", "medium", "low"] as Priority[]).map((item) => <Pressable key={item} accessibilityRole="button" accessibilityLabel={`Set new task priority ${item}`} onPress={() => setNewTaskPriority(item)} style={[styles.chip, newTaskPriority === item && { borderColor: priorityColor(item), backgroundColor: "#FFFFFF" }]}><Text style={{ color: priorityColor(item), fontSize: 12, fontWeight: "700" }}>{item}</Text></Pressable>)}</View></View>
          <View style={styles.taskSetupSection}><Text style={styles.label}>Responsible Colleagues</Text><View style={styles.detailChips}><Pressable accessibilityRole="button" accessibilityLabel="Assign no Responsible Colleagues to new task" onPress={() => setNewTaskResponsibleColleagueIds([])} style={[styles.chip, newTaskResponsibleColleagueIds.length === 0 && styles.chipOn]}><Text style={styles.chipText}>N/A</Text></Pressable>{(dashboard?.directReports ?? []).map((report) => { const selected = newTaskResponsibleColleagueIds.includes(report.id); return <Pressable key={report.id} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${selected ? "Remove" : "Assign"} Responsible Colleague ${report.name} ${selected ? "from" : "to"} new task`} onPress={() => setNewTaskResponsibleColleagueIds((ids) => selected ? ids.filter((id) => id !== report.id) : [...ids, report.id])} style={[styles.chip, selected && styles.chipOn]}><Text style={styles.chipText}>{report.name}</Text></Pressable>; })}</View></View>
          <View style={styles.taskSetupSection}><Text style={styles.label}>Due date</Text><View style={styles.dueDateRow}><Pressable accessibilityRole="button" accessibilityLabel="Choose due date for new task" onPress={() => { Keyboard.dismiss(); setShowDueDatePicker((visible) => !visible); }} style={styles.dueDateButton}><Text style={styles.dueDateText}>{newTaskDueDateLabel}</Text><Text style={styles.destinationChevron}>›</Text></Pressable>{newTaskDueAt !== null && <Pressable accessibilityRole="button" accessibilityLabel="Clear due date for new task" onPress={() => { setNewTaskDueAt(null); setShowDueDatePicker(false); }}><Text style={styles.clearDueDateText}>Clear</Text></Pressable>}</View>{showDueDatePicker && <DateTimePicker value={newTaskDueAt === null ? new Date() : new Date(newTaskDueAt)} mode="date" display={Platform.OS === "ios" ? "compact" : "default"} onChange={(_, selectedDate) => { if (Platform.OS !== "ios") setShowDueDatePicker(false); if (selectedDate) setNewTaskDueAt(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).getTime()); }} />}</View>
          <View style={styles.taskSetupSection}><Text style={styles.label}>Repeat</Text><View style={styles.detailChips}>{(["none", "daily", "weekly", "monthly"] as Recurrence[]).map((item) => <Pressable key={item} accessibilityRole="button" accessibilityLabel={`Set new task repeat ${item}`} onPress={() => setNewTaskRecurrence(item)} style={[styles.chip, newTaskRecurrence === item && styles.chipOn]}><Text style={styles.chipText}>{item === "none" ? "Does not repeat" : item}</Text></Pressable>)}</View></View>
        </View>}
        {!isTaskFormSheet && <View style={styles.actions}><Pressable onPress={closeSheet} disabled={savingEntity}><Text style={styles.cancel}>Cancel</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Confirm ${formTitle.toLowerCase()}`} disabled={savingEntity} onPress={() => void saveEntity()} style={[styles.save, savingEntity && { opacity: 0.58 }]}><Text style={styles.saveText}>{savingEntity ? "Saving…" : formTitle}</Text></Pressable></View>}</> : null}
      {sheet === "selectCategory" && <><View style={styles.pickerHeader}><View style={styles.reorderHeaderCopy}><Text style={styles.modalTitle}>Choose category</Text><Text style={styles.modalHint}>Scroll to any category, or create a new one. The keyboard is dismissed while you choose.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Return to task form" onPress={returnToDestinationForm} style={styles.finishReorder}><Text style={styles.finishReorderText}>Back</Text></Pressable></View><ScrollView nestedScrollEnabled style={styles.pickerScroll} contentContainerStyle={styles.pickerContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator><>{(dashboard?.categories ?? []).map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Use category ${item.name} for ${destinationPickerOrigin === "subCategory" ? "Subtask" : "task"}`} onPress={() => { setSelectedDestinationCategoryId(item.id); setCategory(item.id); setCreatingNewCategory(false); setNewCategoryName(""); if (formParent?.categoryId !== item.id) setSelectedParentTaskId(null); returnToDestinationForm(); }} style={styles.destinationRow}><View style={[styles.managementColour, { backgroundColor: categoryColour(item.colorIndex) }]} /><Text style={styles.managementName}>{item.name}</Text><Text style={styles.destinationArrow}>›</Text></Pressable>)}</><Pressable accessibilityRole="button" accessibilityLabel="Create a new category for this task" onPress={chooseNewCategoryDestination} style={styles.pickerCreate}><Text style={styles.newDestinationText}>＋ Create a new category</Text></Pressable></ScrollView></>}
      {sheet === "selectParent" && <><View style={styles.pickerHeader}><View style={styles.reorderHeaderCopy}><Text style={styles.modalTitle}>Choose parent task</Text><Text style={styles.modalHint}>Scroll to any task in this category, or create a new parent task. The keyboard is dismissed while you choose.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Return to Subtask form" onPress={returnToDestinationForm} style={styles.finishReorder}><Text style={styles.finishReorderText}>Back</Text></Pressable></View><ScrollView nestedScrollEnabled style={styles.pickerScroll} contentContainerStyle={styles.pickerContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator><>{eligibleParentTasks.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Use ${item.text} as Subtask parent`} onPress={() => { setSelectedParentTaskId(item.id); setSelectedDestinationCategoryId(item.categoryId); setCategory(item.categoryId); setCreatingNewParent(false); setNewParentTaskName(""); returnToDestinationForm(); }} style={styles.destinationRow}><Text numberOfLines={1} style={styles.managementName}>{item.hierarchyDepth ? "↳ ".repeat(Math.min(item.hierarchyDepth, 3)) : ""}{item.text}</Text><Text style={styles.destinationArrow}>›</Text></Pressable>)}</><Pressable accessibilityRole="button" accessibilityLabel="Create a new parent task" onPress={() => { setCreatingNewParent(true); setSelectedParentTaskId(null); returnToDestinationForm(); }} style={styles.pickerCreate}><Text style={styles.newDestinationText}>＋ Create a new parent task</Text></Pressable></ScrollView></>}
      {sheet === "selectLandingCategory" && <><View style={styles.pickerHeader}><View style={styles.reorderHeaderCopy}><Text style={styles.modalTitle}>Choose category</Text><Text style={styles.modalHint}>Select which category’s tasks you want to see.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close task-list category picker" onPress={closeSheet} style={styles.finishReorder}><Text style={styles.finishReorderText}>Done</Text></Pressable></View><ScrollView nestedScrollEnabled style={styles.pickerScroll} contentContainerStyle={styles.pickerContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator><Pressable accessibilityRole="button" accessibilityLabel="Select category All tasks" onPress={() => { setCategory("all"); closeSheet(); }} style={styles.destinationRow}><View style={[styles.managementColour, { backgroundColor: "#257863" }]} /><Text style={styles.managementName}>All tasks</Text><Text style={styles.destinationArrow}>›</Text></Pressable>{(dashboard?.categories ?? []).map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Select category ${item.name}`} onPress={() => { setCategory(item.id); closeSheet(); }} style={styles.destinationRow}><View style={[styles.managementColour, { backgroundColor: categoryColour(item.colorIndex) }]} /><Text style={styles.managementName}>{item.name}</Text><Text style={styles.destinationArrow}>›</Text></Pressable>)}</ScrollView></>}
      {sheet === "manageReports" && <><Text style={styles.modalTitle}>Manage Responsible Colleagues</Text><Text style={styles.modalHint}>Deleting a person safely changes their assigned tasks to N/A.</Text><FlatList data={dashboard?.directReports ?? []} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.managementList} ListEmptyComponent={<Text style={styles.modalHint}>No Responsible Colleagues yet.</Text>} renderItem={({ item }) => <View style={styles.managementRow}><Text numberOfLines={1} style={[styles.managementName, styles.managementNameWide]}>{item.name}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Edit Responsible Colleague ${item.name}`} onPress={() => editReport(item)}><Text style={styles.editAction}>Edit</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Delete Responsible Colleague ${item.name}`} onPress={() => deleteReport(item)}><Text style={styles.deleteAction}>Delete</Text></Pressable></View>} /><Pressable accessibilityRole="button" accessibilityLabel="Close Responsible Colleague management" onPress={closeSheet}><Text style={styles.cancel}>Done</Text></Pressable></>}
      {sheet === "selectLandingResponsibleColleague" && <><View style={styles.pickerHeader}><View style={styles.reorderHeaderCopy}><Text style={styles.modalTitle}>Filter by Responsible Colleague</Text><Text style={styles.modalHint}>Show tasks assigned to one colleague, unassigned tasks, or everyone.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close Responsible Colleague task filter" onPress={closeSheet} style={styles.finishReorder}><Text style={styles.finishReorderText}>Done</Text></Pressable></View><ScrollView nestedScrollEnabled style={styles.pickerScroll} contentContainerStyle={styles.pickerContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator><Pressable accessibilityRole="button" accessibilityLabel="Filter task list by all Responsible Colleagues" onPress={() => { setResponsibleColleagueFilter("all"); closeSheet(); }} style={styles.destinationRow}><Text style={styles.managementName}>All Responsible Colleagues</Text><Text style={styles.destinationArrow}>›</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Filter task list by unassigned tasks" onPress={() => { setResponsibleColleagueFilter("unassigned"); closeSheet(); }} style={styles.destinationRow}><Text style={styles.managementName}>N/A — no Responsible Colleague</Text><Text style={styles.destinationArrow}>›</Text></Pressable>{(dashboard?.directReports ?? []).map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Filter task list by Responsible Colleague ${item.name}`} onPress={() => { setResponsibleColleagueFilter(item.id); closeSheet(); }} style={styles.destinationRow}><Text style={styles.managementName}>{item.name}</Text><Text style={styles.destinationArrow}>›</Text></Pressable>)}</ScrollView></>}
      {sheet === "reorderSubcategories" && <><Text style={styles.modalTitle}>Reorder Subtasks</Text><Text style={styles.modalHint}>Long-press and drag to change the order beneath “{reorderParent?.text ?? "this item"}”.</Text><DraggableFlatList data={subcategories} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.managementList} ListEmptyComponent={<Text style={styles.modalHint}>Add a Subtask first.</Text>} onDragEnd={({ data }) => void persistSubcategoryOrder(data)} renderItem={({ item, drag, isActive }) => <View style={[styles.managementRow, isActive && styles.managementRowActive]}><Pressable accessibilityRole="button" accessibilityLabel={`Drag Subtask ${item.text}`} onLongPress={drag} delayLongPress={120} style={styles.dragHandle}><Text style={styles.dragHandleText}>⠿</Text></Pressable><Text numberOfLines={1} style={[styles.managementName, styles.managementNameWide]}>{item.text}</Text></View>} /><Pressable accessibilityRole="button" accessibilityLabel="Close Subtask reordering" onPress={closeSheet}><Text style={styles.cancel}>Done</Text></Pressable></>}
      {sheet === "reorderTasks" && <><View style={styles.reorderHeader}><View style={styles.reorderHeaderCopy}><Text style={styles.modalTitle}>Reorder tasks</Text><Text style={styles.modalHint}>Long-press and drag to reorder the top-level tasks in “{dashboard?.categories.find((item) => item.id === reorderCategoryId)?.name ?? "this category"}”.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Finish reordering and return to task list" onPress={() => { haptic(); closeSheet(); }} style={styles.finishReorder}><Text style={styles.finishReorderText}>Done</Text></Pressable></View><DraggableFlatList data={topLevelTasks} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.managementList} ListEmptyComponent={<Text style={styles.modalHint}>There are no top-level tasks in this category.</Text>} onDragEnd={({ data }) => void persistTaskOrder(data)} renderItem={({ item, drag, isActive }) => <View style={[styles.managementRow, isActive && styles.managementRowActive]}><Pressable accessibilityRole="button" accessibilityLabel={`Drag task ${item.text}`} onLongPress={drag} delayLongPress={120} style={styles.dragHandle}><Text style={styles.dragHandleText}>⠿</Text></Pressable><Text numberOfLines={1} style={[styles.managementName, styles.managementNameWide]}>{item.text}</Text></View>} /><Pressable accessibilityRole="button" accessibilityLabel="Close task reordering" onPress={closeSheet}><Text style={styles.cancel}>Cancel</Text></Pressable></>}
      {sheet === "moveTask" && movingTask && <><Text style={styles.modalTitle}>Move task</Text><Text style={styles.modalHint}>Choose another category, or make “{movingTask.text}” a Subtask beneath a valid task.</Text><Text style={styles.label}>Move to category</Text><FlatList data={dashboard?.categories ?? []} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.destinationList} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Move ${movingTask.text} to ${item.name}`} onPress={() => void moveTask({ categoryId: item.id, parentId: null })} style={styles.destinationRow}><View style={[styles.managementColour, { backgroundColor: categoryColour(item.colorIndex) }]} /><Text style={styles.managementName}>{item.name}</Text><Text style={styles.destinationArrow}>›</Text></Pressable>} /><Text style={styles.label}>Make a Subtask</Text><FlatList data={(dashboard?.tasks ?? []).filter((candidate) => isValidMoveParent(dashboard?.tasks ?? [], movingTask.id, candidate.id))} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.destinationList} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Move ${movingTask.text} under ${item.text}`} onPress={() => void moveTask({ categoryId: item.categoryId, parentId: item.id })} style={styles.destinationRow}><Text numberOfLines={1} style={styles.managementName}>{item.text}</Text><Text style={styles.destinationArrow}>›</Text></Pressable>} /><Pressable accessibilityRole="button" accessibilityLabel="Close task movement" onPress={closeSheet}><Text style={styles.cancel}>Cancel</Text></Pressable></>}
      {sheet === "bulkMove" && <><Text style={styles.modalTitle}>Move selected tasks</Text><Text style={styles.modalHint}>{selectedTaskIds.length} selected task{selectedTaskIds.length === 1 ? "" : "s"} will move together in their current order.</Text><Text style={styles.label}>Move to category</Text><FlatList data={dashboard?.categories ?? []} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.destinationList} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Move selected tasks to ${item.name}`} onPress={() => void moveSelectedTasks({ categoryId: item.id, parentId: null })} style={styles.destinationRow}><View style={[styles.managementColour, { backgroundColor: categoryColour(item.colorIndex) }]} /><Text style={styles.managementName}>{item.name}</Text><Text style={styles.destinationArrow}>›</Text></Pressable>} /><Text style={styles.label}>Make sub-categories</Text><FlatList data={(dashboard?.tasks ?? []).filter((candidate) => !selectedTaskIds.includes(candidate.id) && selectedTaskIds.every((id) => isValidMoveParent(dashboard?.tasks ?? [], id, candidate.id)))} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.destinationList} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Move selected tasks under ${item.text}`} onPress={() => void moveSelectedTasks({ categoryId: item.categoryId, parentId: item.id })} style={styles.destinationRow}><Text numberOfLines={1} style={styles.managementName}>{item.text}</Text><Text style={styles.destinationArrow}>›</Text></Pressable>} /><Pressable accessibilityRole="button" accessibilityLabel="Close bulk task movement" onPress={closeSheet}><Text style={styles.cancel}>Cancel</Text></Pressable></>}
    </View></ScrollView>}{isTaskFormSheet && <View accessibilityLabel="Task setup action footer" style={styles.taskSetupFooter}><Pressable accessibilityRole="button" accessibilityLabel="Cancel task setup" onPress={closeSheet} disabled={savingEntity}><Text style={styles.cancel}>Cancel</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Confirm ${formTitle.toLowerCase()}`} disabled={savingEntity} onPress={() => void saveEntity()} style={[styles.save, savingEntity && { opacity: 0.58 }]}><Text style={styles.saveText}>{savingEntity ? "Saving…" : formTitle}</Text></Pressable></View>}</KeyboardAvoidingView></View></Modal>
  </SafeAreaView></GestureHandlerRootView>;
}

/*
const styles = StyleSheet.create({
  gestureRoot: { flex: 1 }, screen: { flex: 1, backgroundColor: "#F5F3ED" }, center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F3ED" }, loading: { marginTop: 12, color: "#52635F" }, header: { padding: 20, paddingBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: "#257863" }, heading: { fontSize: 34, fontWeight: "800", color: "#172522" }, add: { backgroundColor: "#257863", borderRadius: 12, paddingHorizontal: 15, paddingVertical: 10 }, addText: { color: "#FFF", fontWeight: "800" }, syncBar: { marginHorizontal: 16, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, syncText: { fontSize: 11, fontWeight: "700", color: "#63736D", flex: 1 }, reminderToggle: { borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 16, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "#FFF" }, reminderToggleOn: { backgroundColor: "#DDF1E9", borderColor: "#257863" }, reminderText: { fontSize: 11, fontWeight: "800", color: "#63736D" }, reminderTextOn: { color: "#17614F" }, categoryScroller: { height: 48, flexGrow: 0, flexShrink: 0 }, categoryList: { alignItems: "center", paddingHorizontal: 16, gap: 7, flexGrow: 0 }, category: { height: 40, maxWidth: 176, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 18, backgroundColor: "#FFF" }, categoryOn: { backgroundColor: "#DDF1E9", borderColor: "#257863" }, categoryDot: { width: 7, height: 7, borderRadius: 4 }, categoryText: { fontWeight: "600", fontSize: 12, lineHeight: 16, color: "#53645F", flexShrink: 1 }, categoryTextOn: { color: "#17614F" }, filters: { marginHorizontal: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }, chips: { flexDirection: "row", gap: 6, flexShrink: 1 }, chip: { borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 }, chipOn: { borderColor: "#257863", backgroundColor: "#DDF1E9" }, chipText: { fontSize: 12, fontWeight: "700", textTransform: "capitalize", color: "#42534E" }, toggle: { fontSize: 12, fontWeight: "700", color: "#257863", flexShrink: 0 }, compactTaskControls: { marginHorizontal: 16, marginBottom: 8, gap: 7 }, compactCategoryRow: { flexDirection: "row", alignItems: "stretch", gap: 7 }, categoryPicker: { flex: 1, minWidth: 0, minHeight: 42, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, borderWidth: 1, borderColor: "#B7D8CB", borderRadius: 10, backgroundColor: "#F4FBF7" }, categoryPickerText: { flex: 1, minWidth: 0, color: "#17614F", fontSize: 13, fontWeight: "800" }, categoryPickerArrow: { color: "#17614F", fontSize: 14, fontWeight: "900" }, categoryManageButton: { minWidth: 72, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#B7D8CB", borderRadius: 10, paddingHorizontal: 9, backgroundColor: "#F4FBF7" }, categoryManageButtonText: { color: "#17614F", fontSize: 12, fontWeight: "800" }, compactCategoryDelete: { minWidth: 61, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E8B6B3", borderRadius: 10, paddingHorizontal: 8, backgroundColor: "#FFF7F6" }, compactFilters: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }, taskControlsVisibility: { marginHorizontal: 16, marginBottom: 7, minHeight: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, taskControlsVisibilityText: { color: "#17614F", fontSize: 11, fontWeight: "800" }, taskControlsVisibilityHint: { color: "#73817C", fontSize: 10, fontWeight: "700" }, list: { padding: 16, paddingTop: 10, paddingBottom: 44 }, card: { backgroundColor: "#FFF", borderColor: "#E1E5E1", borderWidth: 1, borderRadius: 14, overflow: "hidden", marginBottom: 9 }, done: { opacity: 0.58 }, row: { padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 10 }, check: { height: 22, width: 22, marginTop: 5, borderRadius: 7, borderWidth: 1.5, borderColor: "#AAB5B0", alignItems: "center", justifyContent: "center" }, checkOn: { backgroundColor: "#257863", borderColor: "#257863" }, checkMark: { color: "#FFF", fontWeight: "800" }, content: { flex: 1, minWidth: 0 }, title: { fontSize: 15, lineHeight: 20, fontWeight: "600", color: "#1F302B" }, strike: { textDecorationLine: "line-through" }, meta: { fontSize: 12, lineHeight: 16, color: "#73817C", marginTop: 3 }, flag: { minWidth: 78, alignItems: "center", marginTop: 2, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 }, details: { padding: 12, borderTopWidth: 1, borderTopColor: "#E1E5E1", backgroundColor: "#FAFCFA", gap: 7 }, label: { fontSize: 12, fontWeight: "800", color: "#53645F" }, detailChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, subcategoryActions: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, subcategoryAction: { alignSelf: "flex-start", paddingVertical: 5 }, subcategoryActionText: { color: "#17614F", fontSize: 12, fontWeight: "800" }, notes: { minHeight: 68, borderWidth: 1, borderColor: "#D7DDD9", backgroundColor: "#FFF", borderRadius: 10, padding: 9, textAlignVertical: "top", color: "#1F302B" }, empty: { alignItems: "center", paddingTop: 70 }, emptyTitle: { fontSize: 18, fontWeight: "800", color: "#1F302B" }, error: { margin: 16, padding: 16, backgroundColor: "#FCE8E6", borderRadius: 12 }, errorText: { color: "#A4312E", fontWeight: "700" }, retry: { color: "#A4312E", fontWeight: "800", marginTop: 8 }, backdrop: { flex: 1, backgroundColor: "rgba(20,32,28,.45)", justifyContent: "flex-end" }, keyboardAvoider: { flex: 1, width: "100%", maxHeight: "100%", justifyContent: "flex-end" }, modalScroll: { maxHeight: "100%" }, modalScrollContent: { flexGrow: 1, justifyContent: "flex-end" }, modal: { maxHeight: "100%", backgroundColor: "#FFF", padding: 20, paddingBottom: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12 }, managementModal: { width: "100%", minHeight: 360, maxHeight: 620 }, managementDraggableList: { flex: 1, minHeight: 0 }, modalTitle: { fontSize: 22, fontWeight: "800", color: "#1F302B" }, modalHint: { fontSize: 13, lineHeight: 18, color: "#63736D" }, menuAction: { borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 12, padding: 13, gap: 3 }, menuActionTitle: { color: "#1F302B", fontSize: 16, fontWeight: "800" }, menuActionHint: { color: "#63736D", fontSize: 12, lineHeight: 16 }, palette: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, paletteColour: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" }, paletteColourSelected: { borderWidth: 3, borderColor: "#172522" }, paletteCheck: { color: "#FFF", fontWeight: "900
  nestedCard: { borderLeftWidth: 4, backgroundColor: "#FAFCFA" }, hierarchyLabel: { color: "#17614F", fontSize: 10, lineHeight: 14, fontWeight: "800", marginBottom: 2 }, selectedCard: { borderColor: "#257863", backgroundColor: "#F4FBF7" }, swipeDelete: { width: 88, marginBottom: 9, marginLeft: 7, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#B23A35" }, swipeDeleteText: { color: "#FFF", fontSize: 12, fontWeight: "800" }, deleteTaskActionText: { color: "#B23A35", fontSize: 12, fontWeight: "800" }, categoryManagementBar: { marginHorizontal: 16, marginTop: 2, marginBottom: 8, flexDirection: "row", alignItems: "stretch", gap: 8 }, categoryManagementButton: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: "#B7D8CB", borderRadius: 11, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: "#F4FBF7", flexDirection: "row", alignItems: "center", gap: 8 }, categoryManagementCopy: { flex: 1, minWidth: 0, gap: 1 }, categoryManagementTitle: { color: "#17614F", fontSize: 12, fontWeight: "800" }, categoryManagementHint: { color: "#63736D", fontSize: 10, lineHeight: 13 }, categoryManagementIcon: { color: "#17614F", fontSize: 17, fontWeight: "800" }, categoryDeleteButton: { minWidth: 66, borderWidth: 1, borderColor: "#E8B6B3", borderRadius: 11, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF7F6" }, categoryDeleteButtonText: { color: "#B23A35", fontSize: 12, fontWeight: "800" }, bulkBar: { marginHorizontal: 16, marginTop: 9, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11, backgroundColor: "#DDF1E9", flexDirection: "row", alignItems: "center", gap: 8 }, bulkText: { flex: 1, color: "#17614F", fontSize: 12, fontWeight: "800" }, bulkMove: { paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "#257863", borderRadius: 8 }, bulkDelete: { paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "#B23A35", borderRadius: 8 }, bulkMoveDisabled: { opacity: 0.5 }, bulkMoveText: { color: "#FFF", fontSize: 12, fontWeight: "800" }, bulkDeleteText: { color: "#FFF", fontSize: 12, fontWeight: "800" }, bulkClear: { color: "#17614F", fontSize: 12, fontWeight: "800", padding: 4 }, reorderHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }, reorderHeaderCopy: { flex: 1, minWidth: 0, gap: 4 }, finishReorder: { backgroundColor: "#257863", paddingHorizontal: 13, paddingVertical: 10, borderRadius: 10, marginTop: 1 }, finishReorderText: { color: "#FFF", fontWeight: "800", fontSize: 13 }, destinationList: { maxHeight: 170, gap: 7, paddingBottom: 3 }, destinationRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: "#E1E5E1", borderRadius: 10, paddingHorizontal: 11, backgroundColor: "#FFF" }, destinationArrow: { color: "#17614F", fontSize: 22, fontWeight: "700" }, destinationSection: { gap: 7 }, destinationPicker: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 10, paddingHorizontal: 11, backgroundColor: "#FFF" }, destinationPickerText: { flex: 1, minWidth: 0, color: "#1F302B", fontSize: 14, fontWeight: "700" }, destinationChevron: { color: "#17614F", fontSize: 18, fontWeight: "800" }, destinationOptions: { gap: 6, padding: 8, borderWidth: 1, borderColor: "#DDE6E1", borderRadius: 10, backgroundColor: "#F8FBF9" }, destinationOption: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, borderRadius: 8 }, destinationOptionText: { flex: 1, minWidth: 0, color: "#1F302B", fontSize: 13, fontWeight: "700" }, newDestinationOption: { borderTopWidth: 1, borderTopColor: "#DDE6E1", paddingHorizontal: 8, paddingTop: 9, paddingBottom: 3 }, newDestinationText: { color: "#17614F", fontSize: 13, fontWeight: "800" }, destinationInput: { borderWidth: 1, borderColor: "#257863", borderRadius: 10, padding: 11, fontSize: 15, color: "#1F302B", backgroundColor: "#FFF" }, pickerHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }, pickerScroll: { maxHeight: 480, minHeight: 180 }, pickerContent: { gap: 8, paddingBottom: 18 }, pickerCreate: { minHeight: 48, justifyContent: "center", borderWidth: 1, borderStyle: "dashed", borderColor: "#8FB8AA", borderRadius: 10, paddingHorizontal: 11, backgroundColor: "#F4FBF7" },
});
*/
const styles: Record<string, any> = new Proxy(StyleSheet.create({
  gestureRoot: { flex: 1 },
  screen: { flex: 1, backgroundColor: "#F7F7F4" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F7F7F4", padding: 28 },
  header: { paddingTop: 20, paddingBottom: 10, paddingHorizontal: 20, gap: 7 },
  headerMainRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minWidth: 0 },
  headerMainRowCompact: { flexDirection: "column", alignItems: "stretch", gap: 10 },
  headerCopy: { flexShrink: 1, minWidth: 0 },
  headerActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, marginLeft: 12, flexShrink: 0 },
  headerActionsCompact: { width: "100%", marginLeft: 0, flexShrink: 1 },
  headerAction: { minHeight: 44, backgroundColor: "#155E4A", borderRadius: 12, paddingHorizontal: 11, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  headerActionCompact: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
  headerSecondaryAction: { minHeight: 44, borderWidth: 1, borderColor: "#C8D0CB", backgroundColor: "#FFFFFF", borderRadius: 12, paddingHorizontal: 11, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  headerActionText: { color: "#FFF", fontSize: 13, fontWeight: "800" },
  headerSecondaryActionText: { color: "#155E4A", fontSize: 13, fontWeight: "800" },
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: "#155E4A" },
  heading: { fontSize: 34, fontWeight: "800", color: "#16221E" },
  headerSubheading: { marginTop: 2, color: "#59635F", fontSize: 12, fontWeight: "600" },
  add: { backgroundColor: "#257863", borderRadius: 12, paddingHorizontal: 15, paddingVertical: 10 },
  addText: { color: "#FFF", fontWeight: "800" },
  syncBar: { marginHorizontal: 16, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  syncText: { fontSize: 11, fontWeight: "700", color: "#59635F", flex: 1 },
  reminderToggle: { minHeight: 36, borderWidth: 1, borderColor: "#C8D0CB", borderRadius: 18, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "#FFFFFF", justifyContent: "center" },
  reminderToggleOn: { backgroundColor: "#E8F5EE", borderColor: "#027A48" },
  reminderText: { fontSize: 11, fontWeight: "800", color: "#59635F" },
  reminderTextOn: { color: "#027A48" },
  categoryScroller: { height: 48, flexGrow: 0, flexShrink: 0 },
  categoryList: { alignItems: "center", paddingHorizontal: 16, gap: 7, flexGrow: 0 },
  category: { height: 40, maxWidth: 176, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 18, backgroundColor: "#FFF" },
  categoryOn: { backgroundColor: "#E8F2ED", borderColor: "#155E4A" },
  categoryDot: { width: 7, height: 7, borderRadius: 4 },
  categoryText: { fontWeight: "600", fontSize: 12, lineHeight: 16, color: "#53645F", flexShrink: 1 },
  categoryTextOn: { color: "#155E4A" },
  compactTaskControls: { marginHorizontal: 16, marginBottom: 8, gap: 7 },
  compactCategoryRow: { flexDirection: "row", alignItems: "stretch", gap: 7 },
  categoryPicker: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, borderWidth: 1, borderColor: "#B7D8CB", borderRadius: 10, backgroundColor: "#FFFFFF" },
  categoryPickerText: { flex: 1, minWidth: 0, color: "#155E4A", fontSize: 13, fontWeight: "800" },
  categoryPickerArrow: { color: "#155E4A", fontSize: 14, fontWeight: "900" },
  categoryManageButton: { minWidth: 72, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#B7D8CB", borderRadius: 10, paddingHorizontal: 9, backgroundColor: "#F4FBF7" },
  categoryManageButtonText: { color: "#17614F", fontSize: 12, fontWeight: "800" },
  compactCategoryDelete: { minWidth: 61, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E8B6B3", borderRadius: 10, paddingHorizontal: 8, backgroundColor: "#FFF7F6" },
  compactFilters: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  taskControlsVisibility: { marginHorizontal: 16, marginBottom: 7, minHeight: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  taskControlsVisibilityText: { color: "#17614F", fontSize: 11, fontWeight: "800" },
  taskControlsVisibilityHint: { color: "#73817C", fontSize: 10, fontWeight: "700" },
  filters: { marginHorizontal: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  chips: { flexDirection: "row", gap: 6, flexShrink: 1 },
  chip: { minHeight: 36, borderWidth: 1, borderColor: "#C8D0CB", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, justifyContent: "center" },
  chipOn: { borderColor: "#155E4A", backgroundColor: "#E8F2ED" },
  chipText: { fontSize: 12, fontWeight: "700", textTransform: "capitalize", color: "#59635F" },
  toggle: { minHeight: 36, fontSize: 12, fontWeight: "700", color: "#155E4A", flexShrink: 0, paddingVertical: 8 },
  list: { padding: 16, paddingTop: 10, paddingBottom: 44 },
  card: { backgroundColor: "#FFFFFF", borderColor: "#DDE3DE", borderWidth: 1, borderRadius: 14, overflow: "hidden", marginBottom: 9 },
  row: { padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  check: { height: 32, width: 32, marginTop: 0, borderRadius: 9, borderWidth: 1.5, borderColor: "#9AA6A0", alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: "#027A48", borderColor: "#027A48" },
  selectionCheckOn: { backgroundColor: "#155E4A", borderColor: "#155E4A" },
  checkMark: { color: "#FFF", fontWeight: "800" },
  content: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: "600", color: "#16221E" },
  meta: { fontSize: 12, lineHeight: 16, color: "#59635F", marginTop: 3 },
  flag: { minWidth: 78, alignItems: "center", marginTop: 2, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  details: { padding: 12, borderTopWidth: 1, borderTopColor: "#DDE3DE", backgroundColor: "#F7F7F4", gap: 7 },
  label: { fontSize: 12, fontWeight: "800", color: "#59635F" },
  taskNameInput: { minHeight: 44, borderWidth: 1, borderColor: "#C8D0CB", backgroundColor: "#FFFFFF", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, color: "#16221E", fontSize: 15, fontWeight: "700" },
  detailChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  subcategoryActions: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  subcategoryAction: { alignSelf: "flex-start", paddingVertical: 5 },
  subcategoryActionText: { color: "#155E4A", fontSize: 12, fontWeight: "800" },
  taskSchedule: { gap: 6, paddingTop: 2 },
  clearDueDate: { minHeight: 40, justifyContent: "center" },
  notes: { minHeight: 68, borderWidth: 1, borderColor: "#C8D0CB", backgroundColor: "#FFFFFF", borderRadius: 10, padding: 9, textAlignVertical: "top", color: "#16221E" },
  emailMessage: { minHeight: 132 },
  emailReview: { gap: 8, borderWidth: 1, borderColor: "#B7D8CB", borderRadius: 12, padding: 12, backgroundColor: "#F4FBF7" },
  emailReviewText: { color: "#42534E", fontSize: 13, lineHeight: 18 },
  emailReviewBody: { color: "#1F302B", fontSize: 14, lineHeight: 20, paddingTop: 3 },
  empty: { alignItems: "center", paddingTop: 70 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#16221E" },
  loading: { marginTop: 12, color: "#59635F" },
  offlineRecovery: { margin: 24, padding: 20, borderRadius: 16, gap: 12, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDE3DE" },
  error: { margin: 16, padding: 16, backgroundColor: "#FFF0EF", borderRadius: 12 },
  errorText: { color: "#B42318", fontWeight: "700" },
  retry: { color: "#B42318", fontWeight: "800", marginTop: 8 },
  backdrop: { flex: 1, backgroundColor: "rgba(20,32,28,.45)", justifyContent: "flex-end" },
  keyboardAvoider: { flex: 1, width: "100%", justifyContent: "flex-end" },
  modalScroll: { maxHeight: "100%" },
  modalScrollContent: { flexGrow: 1, justifyContent: "flex-end" },
  taskSetupScroll: { flex: 1, flexShrink: 1, maxHeight: "78%" },
  taskSetupScrollContent: { flexGrow: 0, justifyContent: "flex-end", paddingTop: 20 },
  taskSetupModal: { gap: 14, paddingBottom: 18 },
  taskSetupFooter: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 16, backgroundColor: "#FFF", borderTopWidth: 1, borderTopColor: "#E1E5E1", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18 },
  modal: { maxHeight: "100%", backgroundColor: "#FFFFFF", padding: 20, paddingBottom: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12 },
  managementModal: { width: "100%", minHeight: 360, maxHeight: 620 },
  managementDraggableList: { flex: 1, minHeight: 0 },
  modalTitle: { fontSize: 22, fontWeight: "800", color: "#16221E" },
  modalHint: { fontSize: 13, lineHeight: 18, color: "#59635F" },
  managementList: { gap: 8, paddingBottom: 24 },
  managementRow: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: "#E1E5E1", borderRadius: 11, paddingHorizontal: 9, backgroundColor: "#FFF" },
  managementScroll: { flex: 1, minHeight: 0 },
  managementRowActive: { opacity: 0.72, borderColor: "#155E4A" },
  managementMove: { width: 26, height: 32, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 7, backgroundColor: "#FAFCFA" },
  managementMoveDisabled: { opacity: 0.32 },
  managementMoveText: { color: "#17614F", fontSize: 15, fontWeight: "900" },
  dragHandle: { paddingVertical: 10, paddingRight: 2 },
  dragHandleText: { color: "#63736D", fontSize: 20, lineHeight: 20 },
  managementColour: { width: 12, height: 12, borderRadius: 6 },
  managementName: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: "700", color: "#16221E" },
  managementNameWide: { marginLeft: 2 },
  editAction: { color: "#155E4A", fontSize: 12, fontWeight: "800", padding: 8 },
  deleteAction: { color: "#B42318", fontSize: 12, fontWeight: "800", padding: 8 },
  reorderHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  reorderHeaderCopy: { flex: 1, minWidth: 0, gap: 4 },
  finishReorder: { minHeight: 44, backgroundColor: "#155E4A", paddingHorizontal: 13, paddingVertical: 10, borderRadius: 10, marginTop: 1, justifyContent: "center" },
  finishReorderText: { color: "#FFF", fontWeight: "800", fontSize: 13 },
  destinationRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: "#E1E5E1", borderRadius: 10, paddingHorizontal: 11, backgroundColor: "#FFF" },
  destinationArrow: { color: "#155E4A", fontSize: 22, fontWeight: "700" },
  destinationList: { maxHeight: 170, gap: 7, paddingBottom: 3 },
  destinationSection: { gap: 7 },
  destinationPicker: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 10, paddingHorizontal: 11, backgroundColor: "#FFF" },
  destinationPickerText: { flex: 1, minWidth: 0, color: "#16221E", fontSize: 14, fontWeight: "700" },
  destinationChevron: { color: "#155E4A", fontSize: 18, fontWeight: "800" },
  destinationInput: { borderWidth: 1, borderColor: "#155E4A", borderRadius: 10, padding: 11, fontSize: 15, color: "#16221E", backgroundColor: "#FFFFFF" },
  colleagueFilterBar: { marginHorizontal: 16, marginBottom: 8 },
  colleagueFilterButton: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 10, paddingHorizontal: 11, backgroundColor: "#FFF" },
  colleagueFilterLabel: { color: "#53645F", fontSize: 12, fontWeight: "800" },
  colleagueFilterValue: { flex: 1, minWidth: 0, color: "#17614F", fontSize: 13, fontWeight: "800", textAlign: "right" },
  taskSetup: { gap: 10, paddingTop: 2, paddingBottom: 2 },
  taskSetupSection: { gap: 6 },
  dueDateRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dueDateButton: { flex: 1, minHeight: 43, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 10, paddingHorizontal: 11, backgroundColor: "#FFF" },
  dueDateText: { color: "#16221E", fontSize: 14, fontWeight: "700" },
  clearDueDateText: { color: "#155E4A", fontSize: 12, fontWeight: "800", paddingVertical: 8 },
  pickerHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  pickerScroll: { maxHeight: 480, minHeight: 180 },
  pickerContent: { gap: 8, paddingBottom: 18 },
  pickerCreate: { minHeight: 48, justifyContent: "center", borderWidth: 1, borderStyle: "dashed", borderColor: "#8FB8AA", borderRadius: 10, paddingHorizontal: 11, backgroundColor: "#F4FBF7" },
  newDestinationText: { color: "#17614F", fontSize: 13, fontWeight: "800" },
  menuAction: { borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 12, padding: 13, gap: 3 },
  menuActionTitle: { color: "#16221E", fontSize: 16, fontWeight: "800" },
  menuActionHint: { color: "#59635F", fontSize: 12, lineHeight: 16 },
  palette: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  paletteColour: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  paletteColourSelected: { borderWidth: 3, borderColor: "#16221E" },
  paletteCheck: { color: "#FFF", fontWeight: "900" },
  input: { borderWidth: 1, borderColor: "#C8D0CB", borderRadius: 10, padding: 12, fontSize: 16, color: "#16221E", backgroundColor: "#FFFFFF" },
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 16 },
  cancel: { minHeight: 36, fontWeight: "700", color: "#59635F", paddingVertical: 7 },
  save: { minHeight: 44, backgroundColor: "#155E4A", borderRadius: 10, paddingHorizontal: 15, paddingVertical: 10, justifyContent: "center" },
  saveText: { color: "#FFF", fontWeight: "800" },
  swipeDelete: { width: 88, marginBottom: 9, marginLeft: 7, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#B42318" },
  swipeDeleteText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  deleteTaskActionText: { color: "#B42318", fontSize: 12, fontWeight: "800" },
  nestedCard: { borderLeftWidth: 4, backgroundColor: "#FAFCFA" },
  hierarchyLabel: { color: "#155E4A", fontSize: 10, lineHeight: 14, fontWeight: "800", marginBottom: 2 },
  selectedCard: { borderColor: "#155E4A", borderWidth: 2, backgroundColor: "#E8F2ED" },
  focusedCard: { borderColor: "#155E4A", borderWidth: 2, backgroundColor: "#F2F8F5" },
  done: { opacity: 0.58 },
  strike: { textDecorationLine: "line-through" },
  categoryManagementBar: { marginHorizontal: 16, marginTop: 2, marginBottom: 8, flexDirection: "row", alignItems: "stretch", gap: 8 },
  categoryManagementButton: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: "#B7D8CB", borderRadius: 11, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: "#F4FBF7", flexDirection: "row", alignItems: "center", gap: 8 },
  categoryManagementCopy: { flex: 1, minWidth: 0, gap: 1 },
  categoryManagementTitle: { color: "#17614F", fontSize: 12, fontWeight: "800" },
  categoryManagementHint: { color: "#63736D", fontSize: 10, lineHeight: 13 },
  categoryManagementIcon: { color: "#17614F", fontSize: 17, fontWeight: "800" },
  categoryDeleteButton: { minWidth: 66, borderWidth: 1, borderColor: "#E8B6B3", borderRadius: 11, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF7F6" },
  categoryDeleteButtonText: { color: "#B23A35", fontSize: 12, fontWeight: "800" },
  bulkBar: { marginHorizontal: 16, marginTop: 9, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11, backgroundColor: "#DDF1E9", flexDirection: "row", alignItems: "center", gap: 8 },
  bulkText: { flex: 1, color: "#17614F", fontSize: 12, fontWeight: "800" },
  bulkMove: { paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "#257863", borderRadius: 8 },
  bulkDelete: { paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "#B23A35", borderRadius: 8 },
  bulkMoveDisabled: { opacity: 0.5 },
  bulkMoveText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  bulkDeleteText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  bulkClear: { color: "#17614F", fontSize: 12, fontWeight: "800", padding: 4 },
  todaySummary: { marginHorizontal: 16, marginTop: 4, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  focusSummaryCopy: { flex: 1, minWidth: 0 },
  todaySummaryActions: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 0 },
  sectionKicker: { color: "#155E4A", fontSize: 11, letterSpacing: 1, fontWeight: "800" },
  todaySummaryTitle: { color: "#16221E", fontSize: 24, fontWeight: "800", marginTop: 2 },
  filterButton: { minHeight: 44, borderWidth: 1, borderColor: "#C8D0CB", borderRadius: 11, paddingHorizontal: 14, justifyContent: "center", backgroundColor: "#FFFFFF" },
  filterButtonText: { color: "#155E4A", fontSize: 13, fontWeight: "800" },
  topThreeDisclosure: { minHeight: 44, maxWidth: 116, flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#B7D8CB", borderRadius: 11, paddingHorizontal: 10, backgroundColor: "#F4FBF7", justifyContent: "center" },
  topThreeDisclosureText: { color: "#155E4A", fontSize: 12, fontWeight: "800", flexShrink: 1 },
  topThreeDisclosureChevron: { color: "#155E4A", fontSize: 15, fontWeight: "900" },
  topThree: { marginHorizontal: 16, marginBottom: 12, gap: 7 },
  topThreeRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: "#DDE3DE", borderRadius: 12, backgroundColor: "#FFFFFF" },
  topThreeNumber: { width: 24, color: "#155E4A", fontSize: 16, fontWeight: "800" },
  topThreeCopy: { flex: 1, minWidth: 0 },
  topThreeTitle: { color: "#16221E", fontSize: 14, fontWeight: "700" },
  topThreePriority: { fontSize: 11, fontWeight: "800", textTransform: "capitalize" },
  workViewBar: { marginHorizontal: 16, marginTop: 3, marginBottom: 10, flexDirection: "row", alignItems: "stretch", gap: 8 },
  workViewPicker: { flex: 1, minWidth: 0, minHeight: 54, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#B7D8CB", borderRadius: 12, paddingHorizontal: 12, backgroundColor: "#F4FBF7" },
  workViewPickerCopy: { flex: 1, minWidth: 0 },
  workViewPickerText: { marginTop: 1, color: "#155E4A", fontSize: 15, fontWeight: "800" },
  workViewSummary: { marginHorizontal: 16, marginBottom: 10, padding: 12, borderWidth: 1, borderColor: "#DDE3DE", borderRadius: 12, backgroundColor: "#FFFFFF", gap: 2 },
  workViewSummaryTitle: { color: "#16221E", fontSize: 17, fontWeight: "800" },
  workViewOption: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#DDE3DE", borderRadius: 12, padding: 12, backgroundColor: "#FFFFFF" },
  workViewOptionOn: { borderColor: "#155E4A", backgroundColor: "#E8F2ED" },
  workViewOptionCopy: { flex: 1, minWidth: 0, gap: 2 },
  workViewOptionTitle: { color: "#16221E", fontSize: 15, fontWeight: "800" },
  workViewOptionTitleOn: { color: "#155E4A" },
  workViewOptionHint: { color: "#59635F", fontSize: 12, lineHeight: 16 },
  workViewOptionCheck: { width: 24, color: "#155E4A", fontSize: 18, fontWeight: "900", textAlign: "center" },
  phonePlanBar: { marginHorizontal: 16, marginBottom: 7, flexDirection: "row", gap: 8 },
  planButton: { minHeight: 44, borderWidth: 1, borderColor: "#C8D0CB", borderRadius: 10, paddingHorizontal: 12, justifyContent: "center", backgroundColor: "#FFFFFF" },
  planButtonText: { color: "#155E4A", fontSize: 12, fontWeight: "800" },
  phoneFilterSummary: { marginHorizontal: 16, marginBottom: 7, minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  agendaGroup: { gap: 0, marginBottom: 8 },
  agendaDate: { color: "#155E4A", fontSize: 13, fontWeight: "800", paddingTop: 6, paddingBottom: 8 },
  workspace: { flex: 1, flexDirection: "row", borderTopWidth: 1, borderTopColor: "#DDE3DE" },
  workspaceNav: { width: 206, borderRightWidth: 1, borderRightColor: "#DDE3DE", backgroundColor: "#FFFFFF" },
  workspaceNavContent: { flexGrow: 1, padding: 14, gap: 4 },
  workspaceLabel: { color: "#59635F", fontSize: 10, letterSpacing: 0.9, fontWeight: "800", marginBottom: 7 },
  workspaceNavDivider: { height: 1, backgroundColor: "#DDE3DE", marginVertical: 10 },
  workspaceWorkView: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: "transparent", borderRadius: 9 },
  workspaceWorkViewOn: { borderColor: "#86B8A7", backgroundColor: "#E8F2ED" },
  workspaceWorkViewText: { flex: 1, minWidth: 0, color: "#42534E", fontSize: 13, fontWeight: "800" },
  workspaceWorkViewTextOn: { color: "#155E4A" },
  workspaceWorkViewCheck: { width: 18, color: "#155E4A", fontSize: 15, fontWeight: "900", textAlign: "center" },
  workspaceNavItem: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, borderRadius: 9 },
  workspaceNavItemOn: { backgroundColor: "#E8F2ED" },
  workspaceNavText: { flex: 1, minWidth: 0, color: "#59635F", fontSize: 13, fontWeight: "700" },
  workspaceNavTextOn: { color: "#155E4A" },
  workspaceNavFooter: { marginTop: 14, gap: 6 },
  workspaceNavAction: { minHeight: 44, justifyContent: "center", paddingHorizontal: 10 },
  workspaceNavActionText: { color: "#155E4A", fontSize: 12, fontWeight: "800" },
  workspaceList: { flex: 1.15, minWidth: 260, backgroundColor: "#F7F7F4" },
  workspaceListHeader: { minHeight: 70, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#DDE3DE" },
  workspaceListHeaderCopy: { flex: 1, minWidth: 0, paddingRight: 10 },
  workspaceListTitle: { color: "#16221E", fontSize: 20, fontWeight: "800" },
  workspaceListActions: { flexDirection: "row", alignItems: "center", gap: 7, flexShrink: 0 },
  workspacePreviewToggle: { minHeight: 44, justifyContent: "center", paddingHorizontal: 10, borderWidth: 1, borderColor: "#C8D0CB", borderRadius: 9, backgroundColor: "#FFFFFF" },
  workspacePreviewToggleOn: { borderColor: "#86B8A7", backgroundColor: "#E8F2ED" },
  workspacePreviewToggleText: { color: "#155E4A", fontSize: 12, fontWeight: "800" },
  workspaceOrderButton: { minHeight: 40, justifyContent: "center", paddingHorizontal: 10, borderWidth: 1, borderColor: "#C8D0CB", borderRadius: 9, backgroundColor: "#FFFFFF" },
  workspaceOrderText: { color: "#155E4A", fontSize: 12, fontWeight: "800" },
  workspaceOrderUnavailable: { maxWidth: 126, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: "#EFF1EF" },
  workspaceOrderUnavailableText: { color: "#59635F", fontSize: 10, lineHeight: 13, fontWeight: "700" },
  workspaceTaskList: { padding: 12, paddingBottom: 34 },
  inspector: { flex: 1, minWidth: 290, padding: 14, borderLeftWidth: 1, borderLeftColor: "#DDE3DE", backgroundColor: "#FFFFFF" },
  inspectorEmpty: { flex: 1, justifyContent: "center", alignItems: "center", padding: 26, gap: 7 },
}), { get: (target, key) => Reflect.get(target, key) ?? {} });
