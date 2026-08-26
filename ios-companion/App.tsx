import * as Haptics from "expo-haptics";
import NetInfo from "@react-native-community/netinfo";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView, Swipeable } from "react-native-gesture-handler";
import DraggableFlatList from "react-native-draggable-flatlist";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { createCategoryRemote, createDirectReportRemote, createTaskRemote, deleteCategoryRemote, deleteDirectReportRemote, deleteTaskRemote, getDashboard, reorderCategoriesRemote, reorderTasksRemote, updateCategoryRemote, updateDirectReportRemote } from "./src/api";
import { addTemporaryTask, applyTaskPatch, cacheDashboard, enqueueMutation, flushQueuedMutations, loadCachedDashboard, queueLength } from "./src/offlineSync";
import { configurePushReminders, remindersEnabled } from "./src/notifications";
import { dueText, orderTasks, priorityColor, taskMatchesPriority, type OrderedTask } from "./src/taskUtils";
import { buildBulkTaskMoveUpdates, buildTaskMoveUpdates, buildTaskReorderUpdates, isValidMoveParent, type TaskMoveDestination } from "./src/taskMovement";
import type { Category, DashboardPayload, DirectReport, Priority, Task, TaskCreateInput } from "./src/types";

const haptic = () => { if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); };
const priorities: Array<"all" | Priority> = ["all", "high", "medium", "low"];
const categoryColours = ["#2A78D6", "#EB6834", "#1BAF7A", "#EDA100", "#E87BA4", "#008300", "#4A3AA7", "#E34948"];
type Sheet = "menu" | "task" | "category" | "subCategory" | "directReport" | "manageCategories" | "manageReports" | "reorderSubcategories" | "reorderTasks" | "moveTask" | "bulkMove" | "selectCategory" | "selectParent" | "selectLandingCategory" | null;
const categoryColour = (colourIndex: number) => categoryColours[colourIndex % categoryColours.length] ?? categoryColours[0]!;

function TaskRow({ task, category, directReports, save, onCreateSubcategory, onReorderSubcategories, onMoveTask, onDeleteTask, selectionMode, selected, onToggleSelection }: { task: OrderedTask; category?: Category; directReports: DirectReport[]; save: (patch: Partial<Task>) => Promise<void>; onCreateSubcategory: (parent: Task) => void; onReorderSubcategories: (parent: Task) => void; onMoveTask: (task: Task) => void; onDeleteTask: (task: Task) => void; selectionMode: boolean; selected: boolean; onToggleSelection: (taskId: number) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(task.note);
  const action = (patch: Partial<Task>) => { haptic(); void save(patch); };
  const isNested = task.hierarchyDepth > 0;
  const nestingOffset = Math.min(task.hierarchyDepth, 3) * 16;
  const card = <View style={[styles.card, isNested && styles.nestedCard, isNested && { marginLeft: nestingOffset, borderLeftColor: category ? categoryColour(category.colorIndex) : "#257863" }, task.done && styles.done, selected && styles.selectedCard]}>
    <View style={styles.row}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selectionMode ? selected : task.done }} accessibilityLabel={selectionMode ? `${selected ? "Deselect" : "Select"} ${task.text}` : undefined} onPress={() => selectionMode ? onToggleSelection(task.id) : action({ done: !task.done })} style={[styles.check, (selectionMode ? selected : task.done) && styles.checkOn]}><Text style={styles.checkMark}>{(selectionMode ? selected : task.done) ? "✓" : ""}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => { haptic(); setOpen(!open); }} style={styles.content}>{isNested && <Text numberOfLines={1} style={styles.hierarchyLabel}>↳ Sub-category of {task.parentTaskText ?? "parent task"}</Text>}<Text style={[styles.title, task.done && styles.strike]} numberOfLines={2}>{task.text}</Text><Text style={styles.meta}>{category?.name ?? "Tasks"} · {dueText(task.dueAt)}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Change priority for ${task.text}`} onPress={() => { haptic(); setOpen(!open); }} style={[styles.flag, { borderColor: priorityColor(task.priority) }]}><Text numberOfLines={1} style={{ color: priorityColor(task.priority), fontWeight: "700", fontSize: 11 }}>⚑ {task.priority}</Text></Pressable>
    </View>
    {open && <View style={styles.details}>
      <Text style={styles.label}>Priority</Text><View style={styles.detailChips}>{(["high", "medium", "low"] as Priority[]).map((entry) => <Pressable key={entry} accessibilityRole="button" accessibilityLabel={`Set priority ${entry}`} onPress={() => action({ priority: entry })} style={[styles.chip, task.priority === entry && { borderColor: priorityColor(entry), backgroundColor: "#FFFFFF" }]}><Text style={{ color: priorityColor(entry), fontSize: 12, fontWeight: "700" }}>{entry}</Text></Pressable>)}</View>
      <Text style={styles.label}>Responsible Colleague</Text><View style={styles.detailChips}><Pressable accessibilityRole="button" accessibilityLabel={`Assign no Responsible Colleague to ${task.text}`} onPress={() => action({ accountableDirectReportId: null })} style={[styles.chip, task.accountableDirectReportId === null && styles.chipOn]}><Text style={styles.chipText}>N/A</Text></Pressable>{directReports.map((report) => <Pressable key={report.id} accessibilityRole="button" accessibilityLabel={`Assign Responsible Colleague ${report.name} to ${task.text}`} onPress={() => action({ accountableDirectReportId: report.id })} style={[styles.chip, task.accountableDirectReportId === report.id && styles.chipOn]}><Text style={styles.chipText}>{report.name}</Text></Pressable>)}</View>
      <View style={styles.subcategoryActions}><Pressable accessibilityRole="button" accessibilityLabel={`Move task ${task.text}`} onPress={() => onMoveTask(task)} style={styles.subcategoryAction}><Text style={styles.subcategoryActionText}>↗ Move task</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Add sub-category under ${task.text}`} onPress={() => onCreateSubcategory(task)} style={styles.subcategoryAction}><Text style={styles.subcategoryActionText}>＋ Add sub-category</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Reorder sub-categories under ${task.text}`} onPress={() => onReorderSubcategories(task)} style={styles.subcategoryAction}><Text style={styles.subcategoryActionText}>↕ Reorder sub-categories</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Delete task ${task.text}`} onPress={() => onDeleteTask(task)} style={styles.subcategoryAction}><Text style={styles.deleteTaskActionText}>⌫ Delete task</Text></Pressable></View>
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
  const [category, setCategory] = useState<number | "all">("all");
  const [priority, setPriority] = useState<"all" | Priority>("all");
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
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [reminders, setReminders] = useState(false);
  const [savingEntity, setSavingEntity] = useState(false);
  const [taskControlsVisible, setTaskControlsVisible] = useState(true);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const newCategoryInputRef = useRef<TextInput>(null);
  const syncing = useRef(false);
  const savingEntityRef = useRef(false);
  const load = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true; setError(null);
    try { const replayed = await flushQueuedMutations(); const fresh = replayed ?? await getDashboard(); setDashboard(fresh); await cacheDashboard(fresh); setPending(await queueLength()); }
    catch (reason) { const cached = await loadCachedDashboard(); if (cached) setDashboard(cached); else setError(reason instanceof Error ? reason.message : "Could not load tasks"); }
    finally { syncing.current = false; setLoading(false); }
  }, []);
  useEffect(() => {
    let mounted = true;
    void (async () => { const cached = await loadCachedDashboard(); if (mounted && cached) { setDashboard(cached); setLoading(false); } if (mounted) { setReminders(await remindersEnabled()); setPending(await queueLength()); } const state = await NetInfo.fetch(); if (mounted) { setOnline(Boolean(state.isConnected && state.isInternetReachable !== false)); if (state.isConnected) void load(); } })();
    const unsubscribe = NetInfo.addEventListener((state) => { const connected = Boolean(state.isConnected && state.isInternetReachable !== false); setOnline(connected); if (connected) void load(); });
    return () => { mounted = false; unsubscribe(); };
  }, [load]);
  const tasks = useMemo(() => dashboard ? orderTasks(dashboard.tasks, dashboard.categories).filter((task) => (category === "all" || task.categoryId === category) && (completed || !task.done) && taskMatchesPriority(task, priority)) : [], [dashboard, category, completed, priority]);
  const subcategories = useMemo(() => dashboard && reorderParent ? dashboard.tasks.filter((task) => task.parentId === reorderParent.id).sort((left, right) => left.sortOrder - right.sortOrder) : [], [dashboard, reorderParent]);
  const topLevelTasks = useMemo(() => dashboard && reorderCategoryId ? dashboard.tasks.filter((task) => task.categoryId === reorderCategoryId && task.parentId === null).sort((left, right) => left.sortOrder - right.sortOrder) : [], [dashboard, reorderCategoryId]);
  const selectedTasks = useMemo(() => tasks.filter((task) => selectedTaskIds.includes(task.id)), [tasks, selectedTaskIds]);
  const activeCreationSheet = sheet === "selectCategory" || sheet === "selectParent" ? destinationPickerOrigin : sheet;
  const formCategoryId = selectedDestinationCategoryId ?? (activeCreationSheet === "subCategory" ? subCategoryParent?.categoryId ?? null : category === "all" ? dashboard?.categories[0]?.id ?? null : category);
  const formCategory = dashboard?.categories.find((item) => item.id === formCategoryId) ?? null;
  const formParent = selectedParentTaskId !== null ? dashboard?.tasks.find((item) => item.id === selectedParentTaskId) ?? null : subCategoryParent;
  const eligibleParentTasks = useMemo(() => dashboard && formCategoryId ? orderTasks(dashboard.tasks, dashboard.categories).filter((task) => task.categoryId === formCategoryId && task.id > 0) : [], [dashboard, formCategoryId]);
  const isCompactIPhone = Platform.OS === "ios" && windowWidth < 600;
  const selectedCategory = category === "all" ? null : dashboard?.categories.find((item) => item.id === category) ?? null;
  const landingCategoryLabel = selectedCategory?.name ?? "All tasks";
  const managementSheetHeight = Math.min(Math.max(Math.round(windowHeight * 0.72), 360), 620);
  const save = async (task: Task, patch: Partial<Task>) => { if (!dashboard) return; const next = applyTaskPatch(dashboard, task.id, patch); setDashboard(next); await cacheDashboard(next); await enqueueMutation({ type: "patch", taskId: task.id, patch }); setPending(await queueLength()); if (online) void load(); };
  const closeSheet = () => { setSheet(null); setText(""); setEditingCategory(null); setEditingReport(null); setSubCategoryParent(null); setSelectedDestinationCategoryId(null); setSelectedParentTaskId(null); setNewCategoryName(""); setNewParentTaskName(""); setCreatingNewCategory(false); setCreatingNewParent(false); setDestinationPickerOrigin(null); setReorderParent(null); setReorderCategoryId(null); setMovingTask(null); };
  const openSheet = (next: Exclude<Sheet, null>) => { haptic(); setText(""); setNewCategoryName(""); setNewParentTaskName(""); setCreatingNewCategory(false); setCreatingNewParent(false); setDestinationPickerOrigin(null); setSheet(next); };
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
    if (parentId && parentId < 0) { Alert.alert("Waiting to sync", "This parent item must finish syncing before you can add a sub-category beneath it."); return; }
    const siblingCount = dashboard.tasks.filter((item) => item.categoryId === categoryId && (item.parentId ?? null) === parentId).length;
    const input: TaskCreateInput = { categoryId, ...(parentId ? { parentId } : {}), text: text.trim(), sortOrder: siblingCount, priority: "medium", mobileClientMutationId: `mobile-create-${Date.now()}-${Math.random().toString(36).slice(2)}` };
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
  const deleteReport = (item: DirectReport) => Alert.alert("Delete Responsible Colleague?", `Tasks assigned to ${item.name} will be set to N/A.`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => void (async () => { if (!ensureOnline()) return; await deleteDirectReportRemote(item.id); await load(); })() }]);
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
  const formTitle = sheet === "category" ? (editingCategory ? "Edit category" : "Add category") : sheet === "directReport" ? (editingReport ? "Edit Responsible Colleague" : "Add Responsible Colleague") : sheet === "subCategory" ? "Add sub-category" : "Add task";
  const formPlaceholder = sheet === "category" ? "Category name" : sheet === "directReport" ? "Responsible Colleague name" : sheet === "subCategory" ? "Sub-category name" : "What needs doing?";
  if (loading) return <SafeAreaView style={styles.center}><StatusBar style="dark" /><ActivityIndicator color="#257863" /><Text style={styles.loading}>Loading Stephen’s tasks…</Text></SafeAreaView>;
  return <GestureHandlerRootView style={styles.gestureRoot}><SafeAreaView style={styles.screen}><StatusBar style="dark" />
    <View style={styles.header}><Text numberOfLines={1} style={styles.eyebrow}>STEPHEN’S WORKSPACE</Text><View style={styles.headerMainRow}><Text numberOfLines={1} style={styles.heading}>To-Do</Text><View style={styles.headerActions}><Pressable accessibilityRole="button" accessibilityLabel={selectionMode ? "Finish selecting tasks" : "Select multiple tasks"} onPress={() => selectionMode ? endSelection() : setSelectionMode(true)} style={styles.headerAction}><Text numberOfLines={1} style={styles.headerActionText}>{selectionMode ? "Done" : "Select"}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Reorder tasks in current category" onPress={() => { if (category === "all") Alert.alert("Choose a category", "Select a category first, then drag its tasks into the order you want."); else { setReorderCategoryId(category); setSheet("reorderTasks"); } }} style={styles.headerAction}><Text numberOfLines={1} style={styles.headerActionText}>↕ Order</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Add item" onPress={() => openSheet("menu")} style={styles.headerAction}><Text numberOfLines={1} style={styles.headerActionText}>＋ Add</Text></Pressable></View></View></View>
    <View style={styles.syncBar}><Text style={styles.syncText}>{online ? (pending ? `${pending} change${pending === 1 ? "" : "s"} syncing…` : "Synced across devices") : `${pending ? `${pending} change${pending === 1 ? "" : "s"} queued` : "Offline cache active"}`}</Text><Pressable accessibilityRole="switch" accessibilityState={{ checked: reminders }} accessibilityLabel="Toggle task reminders" onPress={() => void toggleReminders()} style={[styles.reminderToggle, reminders && styles.reminderToggleOn]}><Text style={[styles.reminderText, reminders && styles.reminderTextOn]}>⚑ Reminders {reminders ? "on" : "off"}</Text></Pressable></View>
    {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.retry}>Try again</Text></Pressable></View> : <>
      {isCompactIPhone ? <><Pressable accessibilityRole="button" accessibilityLabel={taskControlsVisible ? "Hide task controls" : "Show task controls"} onPress={() => { haptic(); setTaskControlsVisible((visible) => !visible); }} style={styles.taskControlsVisibility}><Text style={styles.taskControlsVisibilityText}>{taskControlsVisible ? "⌃ Hide task controls" : "⌄ Show task controls"}</Text><Text style={styles.taskControlsVisibilityHint}>{taskControlsVisible ? "More room for tasks" : `Viewing ${landingCategoryLabel}`}</Text></Pressable>{taskControlsVisible && <View style={styles.compactTaskControls}><View style={styles.compactCategoryRow}><Pressable accessibilityRole="button" accessibilityLabel="Choose task-list category" onPress={() => { haptic(); setSheet("selectLandingCategory"); }} style={styles.categoryPicker}><View style={[styles.categoryDot, { backgroundColor: selectedCategory ? categoryColour(selectedCategory.colorIndex) : "#257863" }]} /><Text numberOfLines={1} style={styles.categoryPickerText}>{landingCategoryLabel}</Text><Text style={styles.categoryPickerArrow}>⌄</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Manage and reorder categories" onPress={() => { haptic(); setSheet("manageCategories"); }} style={styles.categoryManageButton}><Text style={styles.categoryManageButtonText}>Manage</Text></Pressable>{selectedCategory && <Pressable accessibilityRole="button" accessibilityLabel={`Delete selected category ${selectedCategory.name}`} onPress={() => deleteCategory(selectedCategory)} style={styles.compactCategoryDelete}><Text style={styles.categoryDeleteButtonText}>Delete</Text></Pressable>}</View><View style={styles.compactFilters}><View style={styles.chips}>{priorities.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityLabel={`Filter priority ${item}`} onPress={() => setPriority(item)} style={[styles.chip, priority === item && styles.chipOn]}><Text style={styles.chipText}>{item}</Text></Pressable>)}</View><Pressable accessibilityRole="button" accessibilityLabel={completed ? "Hide completed tasks" : "Show completed tasks"} onPress={() => setCompleted(!completed)}><Text style={styles.toggle}>{completed ? "Hide completed" : "Show completed"}</Text></Pressable></View></View>}</> : <><FlatList horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroller} data={[{ id: "all", name: "All tasks", colorIndex: 0 }, ...(dashboard?.categories ?? [])]} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.categoryList} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Filter by ${item.name}`} onPress={() => { haptic(); setCategory(item.id as number | "all"); }} style={[styles.category, item.id !== "all" && { borderColor: categoryColour(item.colorIndex) }, category === item.id && styles.categoryOn]}><View style={[styles.categoryDot, { backgroundColor: item.id === "all" ? "#257863" : categoryColour(item.colorIndex) }]} /><Text numberOfLines={1} ellipsizeMode="tail" style={[styles.categoryText, category === item.id && styles.categoryTextOn]}>{item.name}</Text></Pressable>} /><View style={styles.categoryManagementBar}><Pressable accessibilityRole="button" accessibilityLabel="Manage and reorder categories" onPress={() => { haptic(); setSheet("manageCategories"); }} style={styles.categoryManagementButton}><View style={styles.categoryManagementCopy}><Text style={styles.categoryManagementTitle}>Manage categories</Text><Text style={styles.categoryManagementHint}>Rename, colour, delete, or drag to reorder</Text></View><Text style={styles.categoryManagementIcon}>⚙</Text></Pressable>{selectedCategory && <Pressable accessibilityRole="button" accessibilityLabel={`Delete selected category ${selectedCategory.name}`} onPress={() => deleteCategory(selectedCategory)} style={styles.categoryDeleteButton}><Text style={styles.categoryDeleteButtonText}>Delete</Text></Pressable>}</View><View style={styles.filters}><View style={styles.chips}>{priorities.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityLabel={`Filter priority ${item}`} onPress={() => setPriority(item)} style={[styles.chip, priority === item && styles.chipOn]}><Text style={styles.chipText}>{item}</Text></Pressable>)}</View><Pressable accessibilityRole="button" accessibilityLabel={completed ? "Hide completed tasks" : "Show completed tasks"} onPress={() => setCompleted(!completed)}><Text style={styles.toggle}>{completed ? "Hide completed" : "Show completed"}</Text></Pressable></View></>}
      {selectionMode && <View style={styles.bulkBar}><Text style={styles.bulkText}>{selectedTaskIds.length} selected</Text><Pressable accessibilityRole="button" accessibilityLabel="Move selected tasks" disabled={!selectedTaskIds.length} onPress={() => setSheet("bulkMove")} style={[styles.bulkMove, !selectedTaskIds.length && styles.bulkMoveDisabled]}><Text style={styles.bulkMoveText}>Move selected</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Delete selected tasks" disabled={!selectedTaskIds.length} onPress={() => requestDeleteTasks(selectedTaskIds)} style={[styles.bulkDelete, !selectedTaskIds.length && styles.bulkMoveDisabled]}><Text style={styles.bulkDeleteText}>Delete</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Clear selected tasks" onPress={() => setSelectedTaskIds([])}><Text style={styles.bulkClear}>Clear</Text></Pressable></View>}
      <FlatList data={tasks} keyExtractor={(task) => String(task.id)} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#257863" />} renderItem={({ item }) => <TaskRow task={item} category={dashboard?.categories.find((entry) => entry.id === item.categoryId)} directReports={dashboard?.directReports ?? []} save={(patch) => save(item, patch)} onCreateSubcategory={(parent) => { setSubCategoryParent(parent); openSheet("subCategory"); }} onReorderSubcategories={(parent) => { setReorderParent(parent); setSheet("reorderSubcategories"); }} onMoveTask={(task) => { setMovingTask(task); setSheet("moveTask"); }} onDeleteTask={(task) => requestDeleteTasks([task.id])} selectionMode={selectionMode} selected={selectedTaskIds.includes(item.id)} onToggleSelection={toggleTaskSelection} />} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>No matching tasks</Text><Text style={styles.meta}>Adjust a filter or add your next task.</Text></View>} />
    </>}
    <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={closeSheet}><View style={styles.backdrop}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={8} style={styles.keyboardAvoider}>{sheet === "manageCategories" ? <CategoryManagerSheet categories={dashboard?.categories ?? []} height={managementSheetHeight} onMove={moveCategory} onEdit={editCategory} onDelete={deleteCategory} onDone={closeSheet} /> : <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} scrollEnabled={sheet !== "selectCategory" && sheet !== "selectParent" && sheet !== "selectLandingCategory"} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false}><View style={styles.modal}>
      {sheet === "menu" ? <><Text style={styles.modalTitle}>Add to To-Do</Text><Text style={styles.modalHint}>Create or manage items that sync across your dashboard and devices.</Text><Pressable accessibilityRole="button" accessibilityLabel="Add task" onPress={() => openSheet("task")} style={styles.menuAction}><Text style={styles.menuActionTitle}>Task</Text><Text style={styles.menuActionHint}>Add a work item to the selected category.</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Add category" onPress={() => { setCategoryColourIndex(0); openSheet("category"); }} style={styles.menuAction}><Text style={styles.menuActionTitle}>Category</Text><Text style={styles.menuActionHint}>Create a new top-level category.</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Add Responsible Colleague" onPress={() => openSheet("directReport")} style={styles.menuAction}><Text style={styles.menuActionTitle}>Responsible Colleague</Text><Text style={styles.menuActionHint}>Add a person accountable for work items.</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Manage categories" onPress={() => setSheet("manageCategories")} style={styles.menuAction}><Text style={styles.menuActionTitle}>Manage categories</Text><Text style={styles.menuActionHint}>Rename, colour, delete, or drag to reorder.</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Manage Responsible Colleagues" onPress={() => setSheet("manageReports")} style={styles.menuAction}><Text style={styles.menuActionTitle}>Manage Responsible Colleagues</Text><Text style={styles.menuActionHint}>Rename or delete your accountability list.</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Close add menu" onPress={closeSheet}><Text style={styles.cancel}>Cancel</Text></Pressable></> : null}
      {sheet === "category" || sheet === "directReport" || sheet === "task" || sheet === "subCategory" ? <><Text style={styles.modalTitle}>{formTitle}</Text>
        {(sheet === "task" || sheet === "subCategory") && <View style={styles.destinationSection}>
          <Text style={styles.label}>Category</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose task category" onPress={() => openDestinationPicker("category")} style={styles.destinationPicker}><View style={[styles.managementColour, { backgroundColor: creatingNewCategory ? "#257863" : formCategory ? categoryColour(formCategory.colorIndex) : "#AAB5B0" }]} /><Text numberOfLines={1} style={styles.destinationPickerText}>{creatingNewCategory ? "New category" : formCategory?.name ?? "Choose a category"}</Text><Text style={styles.destinationChevron}>›</Text></Pressable>
          {creatingNewCategory && <TextInput ref={newCategoryInputRef} autoFocus value={newCategoryName} onChangeText={setNewCategoryName} placeholder="New category name" accessibilityLabel="New category for task" style={styles.destinationInput} />}
        </View>}
        {sheet === "subCategory" && <View style={styles.destinationSection}>
          <Text style={styles.label}>Parent task</Text><Text style={styles.modalHint}>Choose where this sub-task will sit, or create a new parent task.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose parent task for sub-task" onPress={() => openDestinationPicker("parent")} style={styles.destinationPicker}><Text numberOfLines={1} style={styles.destinationPickerText}>{creatingNewParent ? "New parent task" : formParent?.text ?? "Choose a parent task"}</Text><Text style={styles.destinationChevron}>›</Text></Pressable>
          {creatingNewParent && <TextInput value={newParentTaskName} onChangeText={setNewParentTaskName} placeholder="New parent task name" accessibilityLabel="New parent task" style={styles.destinationInput} />}
        </View>}
        {sheet === "category" && <View style={styles.palette}>{categoryColours.map((colour, colorIndex) => <Pressable key={colour} accessibilityRole="button" accessibilityLabel={`Select category colour ${colorIndex + 1}`} onPress={() => setCategoryColourIndex(colorIndex)} style={[styles.paletteColour, { backgroundColor: colour }, categoryColourIndex === colorIndex && styles.paletteColourSelected]}><Text style={styles.paletteCheck}>{categoryColourIndex === colorIndex ? "✓" : ""}</Text></Pressable>)}</View>}
        <TextInput autoFocus={!creatingNewCategory} value={text} onChangeText={setText} onSubmitEditing={() => void saveEntity()} returnKeyType="done" placeholder={formPlaceholder} accessibilityLabel={formTitle} style={styles.input} /><View style={styles.actions}><Pressable onPress={closeSheet} disabled={savingEntity}><Text style={styles.cancel}>Cancel</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Confirm ${formTitle.toLowerCase()}`} disabled={savingEntity} onPress={() => void saveEntity()} style={[styles.save, savingEntity && { opacity: 0.58 }]}><Text style={styles.saveText}>{savingEntity ? "Saving…" : formTitle}</Text></Pressable></View></> : null}
      {sheet === "selectCategory" && <><View style={styles.pickerHeader}><View style={styles.reorderHeaderCopy}><Text style={styles.modalTitle}>Choose category</Text><Text style={styles.modalHint}>Scroll to any category, or create a new one. The keyboard is dismissed while you choose.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Return to task form" onPress={returnToDestinationForm} style={styles.finishReorder}><Text style={styles.finishReorderText}>Back</Text></Pressable></View><ScrollView nestedScrollEnabled style={styles.pickerScroll} contentContainerStyle={styles.pickerContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator><>{(dashboard?.categories ?? []).map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Use category ${item.name} for ${destinationPickerOrigin === "subCategory" ? "sub-task" : "task"}`} onPress={() => { setSelectedDestinationCategoryId(item.id); setCategory(item.id); setCreatingNewCategory(false); setNewCategoryName(""); if (formParent?.categoryId !== item.id) setSelectedParentTaskId(null); returnToDestinationForm(); }} style={styles.destinationRow}><View style={[styles.managementColour, { backgroundColor: categoryColour(item.colorIndex) }]} /><Text style={styles.managementName}>{item.name}</Text><Text style={styles.destinationArrow}>›</Text></Pressable>)}</><Pressable accessibilityRole="button" accessibilityLabel="Create a new category for this task" onPress={chooseNewCategoryDestination} style={styles.pickerCreate}><Text style={styles.newDestinationText}>＋ Create a new category</Text></Pressable></ScrollView></>}
      {sheet === "selectParent" && <><View style={styles.pickerHeader}><View style={styles.reorderHeaderCopy}><Text style={styles.modalTitle}>Choose parent task</Text><Text style={styles.modalHint}>Scroll to any task in this category, or create a new parent task. The keyboard is dismissed while you choose.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Return to sub-task form" onPress={returnToDestinationForm} style={styles.finishReorder}><Text style={styles.finishReorderText}>Back</Text></Pressable></View><ScrollView nestedScrollEnabled style={styles.pickerScroll} contentContainerStyle={styles.pickerContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator><>{eligibleParentTasks.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Use ${item.text} as sub-task parent`} onPress={() => { setSelectedParentTaskId(item.id); setSelectedDestinationCategoryId(item.categoryId); setCategory(item.categoryId); setCreatingNewParent(false); setNewParentTaskName(""); returnToDestinationForm(); }} style={styles.destinationRow}><Text numberOfLines={1} style={styles.managementName}>{item.hierarchyDepth ? "↳ ".repeat(Math.min(item.hierarchyDepth, 3)) : ""}{item.text}</Text><Text style={styles.destinationArrow}>›</Text></Pressable>)}</><Pressable accessibilityRole="button" accessibilityLabel="Create a new parent task" onPress={() => { setCreatingNewParent(true); setSelectedParentTaskId(null); returnToDestinationForm(); }} style={styles.pickerCreate}><Text style={styles.newDestinationText}>＋ Create a new parent task</Text></Pressable></ScrollView></>}
      {sheet === "selectLandingCategory" && <><View style={styles.pickerHeader}><View style={styles.reorderHeaderCopy}><Text style={styles.modalTitle}>Choose category</Text><Text style={styles.modalHint}>Select which category’s tasks you want to see.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close task-list category picker" onPress={closeSheet} style={styles.finishReorder}><Text style={styles.finishReorderText}>Done</Text></Pressable></View><ScrollView nestedScrollEnabled style={styles.pickerScroll} contentContainerStyle={styles.pickerContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator><Pressable accessibilityRole="button" accessibilityLabel="Select category All tasks" onPress={() => { setCategory("all"); closeSheet(); }} style={styles.destinationRow}><View style={[styles.managementColour, { backgroundColor: "#257863" }]} /><Text style={styles.managementName}>All tasks</Text><Text style={styles.destinationArrow}>›</Text></Pressable>{(dashboard?.categories ?? []).map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Select category ${item.name}`} onPress={() => { setCategory(item.id); closeSheet(); }} style={styles.destinationRow}><View style={[styles.managementColour, { backgroundColor: categoryColour(item.colorIndex) }]} /><Text style={styles.managementName}>{item.name}</Text><Text style={styles.destinationArrow}>›</Text></Pressable>)}</ScrollView></>}
      {sheet === "manageReports" && <><Text style={styles.modalTitle}>Manage Responsible Colleagues</Text><Text style={styles.modalHint}>Deleting a person safely changes their assigned tasks to N/A.</Text><FlatList data={dashboard?.directReports ?? []} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.managementList} ListEmptyComponent={<Text style={styles.modalHint}>No Responsible Colleagues yet.</Text>} renderItem={({ item }) => <View style={styles.managementRow}><Text numberOfLines={1} style={[styles.managementName, styles.managementNameWide]}>{item.name}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Edit Responsible Colleague ${item.name}`} onPress={() => editReport(item)}><Text style={styles.editAction}>Edit</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Delete Responsible Colleague ${item.name}`} onPress={() => deleteReport(item)}><Text style={styles.deleteAction}>Delete</Text></Pressable></View>} /><Pressable accessibilityRole="button" accessibilityLabel="Close Responsible Colleague management" onPress={closeSheet}><Text style={styles.cancel}>Done</Text></Pressable></>}
      {sheet === "reorderSubcategories" && <><Text style={styles.modalTitle}>Reorder sub-categories</Text><Text style={styles.modalHint}>Long-press and drag to change the order beneath “{reorderParent?.text ?? "this item"}”.</Text><DraggableFlatList data={subcategories} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.managementList} ListEmptyComponent={<Text style={styles.modalHint}>Add a sub-category first.</Text>} onDragEnd={({ data }) => void persistSubcategoryOrder(data)} renderItem={({ item, drag, isActive }) => <View style={[styles.managementRow, isActive && styles.managementRowActive]}><Pressable accessibilityRole="button" accessibilityLabel={`Drag sub-category ${item.text}`} onLongPress={drag} delayLongPress={120} style={styles.dragHandle}><Text style={styles.dragHandleText}>⠿</Text></Pressable><Text numberOfLines={1} style={[styles.managementName, styles.managementNameWide]}>{item.text}</Text></View>} /><Pressable accessibilityRole="button" accessibilityLabel="Close sub-category reordering" onPress={closeSheet}><Text style={styles.cancel}>Done</Text></Pressable></>}
      {sheet === "reorderTasks" && <><View style={styles.reorderHeader}><View style={styles.reorderHeaderCopy}><Text style={styles.modalTitle}>Reorder tasks</Text><Text style={styles.modalHint}>Long-press and drag to reorder the top-level tasks in “{dashboard?.categories.find((item) => item.id === reorderCategoryId)?.name ?? "this category"}”.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Finish reordering and return to task list" onPress={() => { haptic(); closeSheet(); }} style={styles.finishReorder}><Text style={styles.finishReorderText}>Done</Text></Pressable></View><DraggableFlatList data={topLevelTasks} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.managementList} ListEmptyComponent={<Text style={styles.modalHint}>There are no top-level tasks in this category.</Text>} onDragEnd={({ data }) => void persistTaskOrder(data)} renderItem={({ item, drag, isActive }) => <View style={[styles.managementRow, isActive && styles.managementRowActive]}><Pressable accessibilityRole="button" accessibilityLabel={`Drag task ${item.text}`} onLongPress={drag} delayLongPress={120} style={styles.dragHandle}><Text style={styles.dragHandleText}>⠿</Text></Pressable><Text numberOfLines={1} style={[styles.managementName, styles.managementNameWide]}>{item.text}</Text></View>} /><Pressable accessibilityRole="button" accessibilityLabel="Close task reordering" onPress={closeSheet}><Text style={styles.cancel}>Cancel</Text></Pressable></>}
      {sheet === "moveTask" && movingTask && <><Text style={styles.modalTitle}>Move task</Text><Text style={styles.modalHint}>Choose another category, or make “{movingTask.text}” a sub-category beneath a valid task.</Text><Text style={styles.label}>Move to category</Text><FlatList data={dashboard?.categories ?? []} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.destinationList} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Move ${movingTask.text} to ${item.name}`} onPress={() => void moveTask({ categoryId: item.id, parentId: null })} style={styles.destinationRow}><View style={[styles.managementColour, { backgroundColor: categoryColour(item.colorIndex) }]} /><Text style={styles.managementName}>{item.name}</Text><Text style={styles.destinationArrow}>›</Text></Pressable>} /><Text style={styles.label}>Make a sub-category</Text><FlatList data={(dashboard?.tasks ?? []).filter((candidate) => isValidMoveParent(dashboard?.tasks ?? [], movingTask.id, candidate.id))} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.destinationList} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Move ${movingTask.text} under ${item.text}`} onPress={() => void moveTask({ categoryId: item.categoryId, parentId: item.id })} style={styles.destinationRow}><Text numberOfLines={1} style={styles.managementName}>{item.text}</Text><Text style={styles.destinationArrow}>›</Text></Pressable>} /><Pressable accessibilityRole="button" accessibilityLabel="Close task movement" onPress={closeSheet}><Text style={styles.cancel}>Cancel</Text></Pressable></>}
      {sheet === "bulkMove" && <><Text style={styles.modalTitle}>Move selected tasks</Text><Text style={styles.modalHint}>{selectedTaskIds.length} selected task{selectedTaskIds.length === 1 ? "" : "s"} will move together in their current order.</Text><Text style={styles.label}>Move to category</Text><FlatList data={dashboard?.categories ?? []} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.destinationList} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Move selected tasks to ${item.name}`} onPress={() => void moveSelectedTasks({ categoryId: item.id, parentId: null })} style={styles.destinationRow}><View style={[styles.managementColour, { backgroundColor: categoryColour(item.colorIndex) }]} /><Text style={styles.managementName}>{item.name}</Text><Text style={styles.destinationArrow}>›</Text></Pressable>} /><Text style={styles.label}>Make sub-categories</Text><FlatList data={(dashboard?.tasks ?? []).filter((candidate) => !selectedTaskIds.includes(candidate.id) && selectedTaskIds.every((id) => isValidMoveParent(dashboard?.tasks ?? [], id, candidate.id)))} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.destinationList} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Move selected tasks under ${item.text}`} onPress={() => void moveSelectedTasks({ categoryId: item.categoryId, parentId: item.id })} style={styles.destinationRow}><Text numberOfLines={1} style={styles.managementName}>{item.text}</Text><Text style={styles.destinationArrow}>›</Text></Pressable>} /><Pressable accessibilityRole="button" accessibilityLabel="Close bulk task movement" onPress={closeSheet}><Text style={styles.cancel}>Cancel</Text></Pressable></>}
    </View></ScrollView>}</KeyboardAvoidingView></View></Modal>
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
  screen: { flex: 1, backgroundColor: "#F5F3ED" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F5F3ED" },
  header: { paddingTop: 20, paddingBottom: 10, paddingHorizontal: 20, gap: 7 },
  headerMainRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minWidth: 0 },
  headerActions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, marginLeft: 12, flexShrink: 0 },
  headerAction: { backgroundColor: "#257863", borderRadius: 12, paddingHorizontal: 11, paddingVertical: 10 },
  headerActionText: { color: "#FFF", fontSize: 13, fontWeight: "800" },
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: "#257863" },
  heading: { fontSize: 34, fontWeight: "800", color: "#172522" },
  add: { backgroundColor: "#257863", borderRadius: 12, paddingHorizontal: 15, paddingVertical: 10 },
  addText: { color: "#FFF", fontWeight: "800" },
  syncBar: { marginHorizontal: 16, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  syncText: { fontSize: 11, fontWeight: "700", color: "#63736D", flex: 1 },
  reminderToggle: { borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 16, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: "#FFF" },
  reminderToggleOn: { backgroundColor: "#DDF1E9", borderColor: "#257863" },
  reminderText: { fontSize: 11, fontWeight: "800", color: "#63736D" },
  reminderTextOn: { color: "#17614F" },
  categoryScroller: { height: 48, flexGrow: 0, flexShrink: 0 },
  categoryList: { alignItems: "center", paddingHorizontal: 16, gap: 7, flexGrow: 0 },
  category: { height: 40, maxWidth: 176, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 18, backgroundColor: "#FFF" },
  categoryOn: { backgroundColor: "#DDF1E9", borderColor: "#257863" },
  categoryDot: { width: 7, height: 7, borderRadius: 4 },
  categoryText: { fontWeight: "600", fontSize: 12, lineHeight: 16, color: "#53645F", flexShrink: 1 },
  categoryTextOn: { color: "#17614F" },
  compactTaskControls: { marginHorizontal: 16, marginBottom: 8, gap: 7 },
  compactCategoryRow: { flexDirection: "row", alignItems: "stretch", gap: 7 },
  categoryPicker: { flex: 1, minWidth: 0, minHeight: 42, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, borderWidth: 1, borderColor: "#B7D8CB", borderRadius: 10, backgroundColor: "#F4FBF7" },
  categoryPickerText: { flex: 1, minWidth: 0, color: "#17614F", fontSize: 13, fontWeight: "800" },
  categoryPickerArrow: { color: "#17614F", fontSize: 14, fontWeight: "900" },
  categoryManageButton: { minWidth: 72, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#B7D8CB", borderRadius: 10, paddingHorizontal: 9, backgroundColor: "#F4FBF7" },
  categoryManageButtonText: { color: "#17614F", fontSize: 12, fontWeight: "800" },
  compactCategoryDelete: { minWidth: 61, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E8B6B3", borderRadius: 10, paddingHorizontal: 8, backgroundColor: "#FFF7F6" },
  compactFilters: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  taskControlsVisibility: { marginHorizontal: 16, marginBottom: 7, minHeight: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  taskControlsVisibilityText: { color: "#17614F", fontSize: 11, fontWeight: "800" },
  taskControlsVisibilityHint: { color: "#73817C", fontSize: 10, fontWeight: "700" },
  filters: { marginHorizontal: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  chips: { flexDirection: "row", gap: 6, flexShrink: 1 },
  chip: { borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  chipOn: { borderColor: "#257863", backgroundColor: "#DDF1E9" },
  chipText: { fontSize: 12, fontWeight: "700", textTransform: "capitalize", color: "#42534E" },
  toggle: { fontSize: 12, fontWeight: "700", color: "#257863", flexShrink: 0 },
  list: { padding: 16, paddingTop: 10, paddingBottom: 44 },
  card: { backgroundColor: "#FFF", borderColor: "#E1E5E1", borderWidth: 1, borderRadius: 14, overflow: "hidden", marginBottom: 9 },
  row: { padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  check: { height: 22, width: 22, marginTop: 5, borderRadius: 7, borderWidth: 1.5, borderColor: "#AAB5B0", alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: "#257863", borderColor: "#257863" },
  checkMark: { color: "#FFF", fontWeight: "800" },
  content: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: "600", color: "#1F302B" },
  meta: { fontSize: 12, lineHeight: 16, color: "#73817C", marginTop: 3 },
  flag: { minWidth: 78, alignItems: "center", marginTop: 2, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  details: { padding: 12, borderTopWidth: 1, borderTopColor: "#E1E5E1", backgroundColor: "#FAFCFA", gap: 7 },
  label: { fontSize: 12, fontWeight: "800", color: "#53645F" },
  detailChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  subcategoryActions: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  subcategoryAction: { alignSelf: "flex-start", paddingVertical: 5 },
  subcategoryActionText: { color: "#17614F", fontSize: 12, fontWeight: "800" },
  notes: { minHeight: 68, borderWidth: 1, borderColor: "#D7DDD9", backgroundColor: "#FFF", borderRadius: 10, padding: 9, textAlignVertical: "top", color: "#1F302B" },
  empty: { alignItems: "center", paddingTop: 70 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#1F302B" },
  loading: { marginTop: 12, color: "#52635F" },
  error: { margin: 16, padding: 16, backgroundColor: "#FCE8E6", borderRadius: 12 },
  errorText: { color: "#A4312E", fontWeight: "700" },
  retry: { color: "#A4312E", fontWeight: "800", marginTop: 8 },
  backdrop: { flex: 1, backgroundColor: "rgba(20,32,28,.45)", justifyContent: "flex-end" },
  keyboardAvoider: { flex: 1, width: "100%", justifyContent: "flex-end" },
  modalScroll: { maxHeight: "100%" },
  modalScrollContent: { flexGrow: 1, justifyContent: "flex-end" },
  modal: { maxHeight: "100%", backgroundColor: "#FFF", padding: 20, paddingBottom: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12 },
  managementModal: { width: "100%", minHeight: 360, maxHeight: 620 },
  managementDraggableList: { flex: 1, minHeight: 0 },
  modalTitle: { fontSize: 22, fontWeight: "800", color: "#1F302B" },
  modalHint: { fontSize: 13, lineHeight: 18, color: "#63736D" },
  managementList: { gap: 8, paddingBottom: 24 },
  managementRow: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: "#E1E5E1", borderRadius: 11, paddingHorizontal: 9, backgroundColor: "#FFF" },
  managementScroll: { flex: 1, minHeight: 0 },
  managementRowActive: { opacity: 0.72, borderColor: "#257863" },
  managementMove: { width: 26, height: 32, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 7, backgroundColor: "#FAFCFA" },
  managementMoveDisabled: { opacity: 0.32 },
  managementMoveText: { color: "#17614F", fontSize: 15, fontWeight: "900" },
  dragHandle: { paddingVertical: 10, paddingRight: 2 },
  dragHandleText: { color: "#63736D", fontSize: 20, lineHeight: 20 },
  managementColour: { width: 12, height: 12, borderRadius: 6 },
  managementName: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: "700", color: "#1F302B" },
  managementNameWide: { marginLeft: 2 },
  editAction: { color: "#17614F", fontSize: 12, fontWeight: "800", padding: 5 },
  deleteAction: { color: "#B23A35", fontSize: 12, fontWeight: "800", padding: 5 },
  reorderHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  reorderHeaderCopy: { flex: 1, minWidth: 0, gap: 4 },
  finishReorder: { backgroundColor: "#257863", paddingHorizontal: 13, paddingVertical: 10, borderRadius: 10, marginTop: 1 },
  finishReorderText: { color: "#FFF", fontWeight: "800", fontSize: 13 },
  destinationRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: "#E1E5E1", borderRadius: 10, paddingHorizontal: 11, backgroundColor: "#FFF" },
  destinationArrow: { color: "#17614F", fontSize: 22, fontWeight: "700" },
  destinationList: { maxHeight: 170, gap: 7, paddingBottom: 3 },
  destinationSection: { gap: 7 },
  destinationPicker: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 10, paddingHorizontal: 11, backgroundColor: "#FFF" },
  destinationPickerText: { flex: 1, minWidth: 0, color: "#1F302B", fontSize: 14, fontWeight: "700" },
  destinationChevron: { color: "#17614F", fontSize: 18, fontWeight: "800" },
  destinationInput: { borderWidth: 1, borderColor: "#257863", borderRadius: 10, padding: 11, fontSize: 15, color: "#1F302B", backgroundColor: "#FFF" },
  pickerHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  pickerScroll: { maxHeight: 480, minHeight: 180 },
  pickerContent: { gap: 8, paddingBottom: 18 },
  pickerCreate: { minHeight: 48, justifyContent: "center", borderWidth: 1, borderStyle: "dashed", borderColor: "#8FB8AA", borderRadius: 10, paddingHorizontal: 11, backgroundColor: "#F4FBF7" },
  newDestinationText: { color: "#17614F", fontSize: 13, fontWeight: "800" },
  menuAction: { borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 12, padding: 13, gap: 3 },
  menuActionTitle: { color: "#1F302B", fontSize: 16, fontWeight: "800" },
  menuActionHint: { color: "#63736D", fontSize: 12, lineHeight: 16 },
  palette: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  paletteColour: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  paletteColourSelected: { borderWidth: 3, borderColor: "#172522" },
  paletteCheck: { color: "#FFF", fontWeight: "900" },
  input: { borderWidth: 1, borderColor: "#D7DDD9", borderRadius: 10, padding: 12, fontSize: 16, color: "#1F302B" },
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 16 },
  cancel: { fontWeight: "700", color: "#53645F", paddingVertical: 7 },
  save: { backgroundColor: "#257863", borderRadius: 10, paddingHorizontal: 15, paddingVertical: 10 },
  saveText: { color: "#FFF", fontWeight: "800" },
  swipeDelete: { width: 88, marginBottom: 9, marginLeft: 7, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#B23A35" },
  swipeDeleteText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  deleteTaskActionText: { color: "#B23A35", fontSize: 12, fontWeight: "800" },
  nestedCard: { borderLeftWidth: 4, backgroundColor: "#FAFCFA" },
  hierarchyLabel: { color: "#17614F", fontSize: 10, lineHeight: 14, fontWeight: "800", marginBottom: 2 },
  selectedCard: { borderColor: "#257863", backgroundColor: "#F4FBF7" },
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
}), { get: (target, key) => Reflect.get(target, key) ?? {} });
